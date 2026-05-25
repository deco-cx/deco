import type { Handler, MiddlewareHandler } from "@hono/hono";

const ONE_MINUTE_MS = 1e3 * 60;

const DECO_IDLE_THRESHOLD_MINUTES_STR = Deno.env.get(
  "DECO_IDLE_THRESHOLD_MINUTES",
);
const DECO_IDLE_NOTIFICATION_ENDPOINT = Deno.env.get(
  "DECO_IDLE_NOTIFICATION_ENDPOINT",
);
const DECO_SELF_SCALE_ENABLED =
  Deno.env.get("DECO_SELF_SCALE_ENABLED") === "true";
const DECO_STATEFULSET_NAME = Deno.env.get("DECO_STATEFULSET_NAME");

const DECO_IDLE_THRESHOLD_MINUTES = DECO_IDLE_THRESHOLD_MINUTES_STR &&
    typeof +DECO_IDLE_THRESHOLD_MINUTES_STR === "number"
  ? Math.max(+DECO_IDLE_THRESHOLD_MINUTES_STR, 1)
  : undefined;

const hasNotificationEndpoint = DECO_IDLE_NOTIFICATION_ENDPOINT !== undefined &&
  URL.canParse(DECO_IDLE_NOTIFICATION_ENDPOINT) &&
  DECO_IDLE_THRESHOLD_MINUTES !== undefined;

let lastActivity = Date.now();

const isIdle = () => {
  if (!DECO_IDLE_THRESHOLD_MINUTES) return false;
  const now = Date.now();
  return now - lastActivity > (DECO_IDLE_THRESHOLD_MINUTES * ONE_MINUTE_MS);
};

// ─── Self-scale via in-pod ServiceAccount ────────────────────────────────
// The daemon PATCHes its own StatefulSet's scale subresource directly via
// the k8s API instead of asking admin to do it. The pod's ServiceAccount
// (provisioned by admin at env-create time) is RBAC-scoped to ONLY this
// StatefulSet's scale subresource, so blast radius is one env.

const SA_TOKEN_PATH = "/var/run/secrets/kubernetes.io/serviceaccount/token";
const SA_CA_CERT_PATH = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt";
const SA_NAMESPACE_PATH =
  "/var/run/secrets/kubernetes.io/serviceaccount/namespace";

interface SelfScaleConfig {
  apiHost: string;
  namespace: string;
  client: Deno.HttpClient;
}

let selfScaleConfig: SelfScaleConfig | undefined | null = undefined;

const initSelfScale = async (): Promise<SelfScaleConfig | null> => {
  if (selfScaleConfig !== undefined) return selfScaleConfig;
  if (!DECO_SELF_SCALE_ENABLED || !DECO_STATEFULSET_NAME) {
    selfScaleConfig = null;
    return null;
  }
  try {
    // CA cert + namespace are stable for the pod's lifetime; cache them.
    // The SA token has a TTL (~1h) and is rotated in place by kubelet, so we
    // re-read it on every PATCH instead of caching it here.
    const [caCert, namespace] = await Promise.all([
      Deno.readTextFile(SA_CA_CERT_PATH),
      Deno.readTextFile(SA_NAMESPACE_PATH),
    ]);
    const host = Deno.env.get("KUBERNETES_SERVICE_HOST");
    const port = Deno.env.get("KUBERNETES_SERVICE_PORT") ?? "443";
    if (!host) {
      console.error(
        "[self-scale] KUBERNETES_SERVICE_HOST not set; falling back to HTTP",
      );
      selfScaleConfig = null;
      return null;
    }
    selfScaleConfig = {
      apiHost: `https://${host}:${port}`,
      namespace: namespace.trim(),
      client: Deno.createHttpClient({ caCerts: [caCert] }),
    };
    return selfScaleConfig;
  } catch (err) {
    console.error("[self-scale] init failed; falling back to HTTP:", err);
    selfScaleConfig = null;
    return null;
  }
};

const scaleSelfToZero = async (): Promise<boolean> => {
  const cfg = await initSelfScale();
  if (!cfg || !DECO_STATEFULSET_NAME) return false;
  let token: string;
  try {
    token = (await Deno.readTextFile(SA_TOKEN_PATH)).trim();
  } catch (err) {
    console.error("[self-scale] failed to read SA token:", err);
    return false;
  }
  const url =
    `${cfg.apiHost}/apis/apps/v1/namespaces/${cfg.namespace}/statefulsets/${DECO_STATEFULSET_NAME}/scale`;
  try {
    const resp = await fetch(url, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/strategic-merge-patch+json",
      },
      body: JSON.stringify({ spec: { replicas: 0 } }),
      client: cfg.client,
    });
    if (!resp.ok) {
      const body = await resp.text();
      console.error(
        `[self-scale] PATCH failed status=${resp.status} body=${body}`,
      );
      return false;
    }
    // Drain the body so the connection is returned to the pool promptly.
    await resp.body?.cancel();
    console.log(
      `[self-scale] scaled self to zero sts=${DECO_STATEFULSET_NAME} ns=${cfg.namespace}`,
    );
    return true;
  } catch (err) {
    console.error("[self-scale] PATCH error:", err);
    return false;
  }
};

// ─── HTTP fallback (legacy admin path) ───────────────────────────────────

const notifyViaHttp = async (notificationUrl: URL): Promise<boolean> => {
  try {
    const resp = await fetch(notificationUrl, { method: "GET" });
    if (!resp.ok) {
      console.error(
        `Failed to notify ${notificationUrl} with status ${resp.status} ${await resp
          .text()}`,
      );
      return false;
    }
    // Drain the body so the connection is returned to the pool promptly.
    await resp.body?.cancel();
    return true;
  } catch (err) {
    console.error(`Failed to notify ${notificationUrl}`, err);
    return false;
  }
};

// ─── Idle loop ────────────────────────────────────────────────────────────
// The interval fires once a minute, but only triggers a single notification
// per idle window: on a successful fire we clear the interval. If activity
// resumes (resetActivity / activityMonitor), we re-arm. This avoids the old
// behavior of pinging admin every minute for the entire pod-termination
// window, which dominated admin's request load.

let idleInterval: number | undefined;
let armedNotificationUrl: URL | undefined | null;

const fireOnce = async (notificationUrl: URL | undefined | null) => {
  console.log(
    `env is considered idle (self-scale=${DECO_SELF_SCALE_ENABLED} http=${!!notificationUrl})`,
  );
  // Self-scale path is preferred; HTTP fallback runs on failure (or when
  // the env is not provisioned with the SA, e.g. existing envs pre-migration).
  let success = false;
  if (DECO_SELF_SCALE_ENABLED) {
    success = await scaleSelfToZero();
  }
  if (!success && notificationUrl) {
    success = await notifyViaHttp(notificationUrl);
  }
  if (success && idleInterval !== undefined) {
    clearInterval(idleInterval);
    idleInterval = undefined;
  }
};

// Guard against re-entrancy: if a previous fireOnce() is still in flight when
// the next interval tick arrives (network hang, slow k8s API), don't kick off
// a second concurrent notification.
const checkActivity = (() => {
  let inFlight = false;
  return (notificationUrl: URL | undefined | null) => {
    if (!isIdle() || inFlight) return;
    inFlight = true;
    fireOnce(notificationUrl).finally(() => {
      inFlight = false;
    });
  };
})();

const armIdleInterval = (notificationUrl: URL | undefined | null) => {
  if (idleInterval !== undefined) return;
  idleInterval = setInterval(
    () => checkActivity(notificationUrl),
    ONE_MINUTE_MS,
  );
};

export const resetActivity = () => {
  lastActivity = Date.now();
  // If we previously cleared the interval after firing, re-arm so that a
  // subsequent idle period will fire again.
  if (idleInterval === undefined && armedNotificationUrl !== undefined) {
    armIdleInterval(armedNotificationUrl);
  }
};

export const activityMonitor: MiddlewareHandler = async (_ctx, next) => {
  resetActivity();
  await next();
};

export const createIdleHandler = (site: string, envName: string): Handler => {
  // Idle monitoring runs whenever a threshold is set and at least one of the
  // two fire paths is configured. Previously this was gated only on the HTTP
  // endpoint, which meant envs with self-scale enabled but no fallback URL
  // would never arm the timer.
  const idleEnabled = DECO_IDLE_THRESHOLD_MINUTES !== undefined &&
    (hasNotificationEndpoint || DECO_SELF_SCALE_ENABLED) &&
    typeof site === "string" &&
    typeof envName === "string";
  if (idleEnabled) {
    // The URL is the HTTP fallback target. Build it only if the endpoint is
    // configured AND parseable; if it's not, fireOnce uses self-scale
    // exclusively. Guarding on the raw env var would crash here when
    // self-scale is enabled but the fallback URL is malformed.
    const notificationUrl: URL | null = hasNotificationEndpoint
      ? (() => {
        const u = new URL(DECO_IDLE_NOTIFICATION_ENDPOINT!);
        u.searchParams.set("site", site);
        u.searchParams.set("name", envName);
        return u;
      })()
      : null;
    armedNotificationUrl = notificationUrl;
    armIdleInterval(notificationUrl);
  }
  return () =>
    new Response(`${isIdle()}`, {
      status: 200,
      headers: {
        "x-deco-last-activity": `${new Date(lastActivity).toISOString()}`,
        "x-deco-idle-threshold-minutes": DECO_IDLE_THRESHOLD_MINUTES
          ? `${DECO_IDLE_THRESHOLD_MINUTES}`
          : "",
        "x-deco-idle-notification-endpoint": DECO_IDLE_NOTIFICATION_ENDPOINT ??
          "",
        "x-deco-self-scale-enabled": `${DECO_SELF_SCALE_ENABLED}`,
      },
    });
};
