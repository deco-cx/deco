import type { Handler, MiddlewareHandler } from "@hono/hono";

const ONE_MINUTE_MS = 1e3 * 60;
const DECO_IDLE_THRESHOLD_MINUTES_STR = Deno.env.get(
  "DECO_IDLE_THRESHOLD_MINUTES",
);
const DECO_IDLE_NOTIFICATION_ENDPOINT = Deno.env.get(
  "DECO_IDLE_NOTIFICATION_ENDPOINT",
);

const DECO_IDLE_THRESHOLD_MINUTES = DECO_IDLE_THRESHOLD_MINUTES_STR &&
    typeof +DECO_IDLE_THRESHOLD_MINUTES_STR === "number"
  ? Math.max(+DECO_IDLE_THRESHOLD_MINUTES_STR, 1)
  : undefined;

let shouldReportActivity = DECO_IDLE_NOTIFICATION_ENDPOINT !== undefined &&
  URL.canParse(DECO_IDLE_NOTIFICATION_ENDPOINT) &&
  DECO_IDLE_THRESHOLD_MINUTES !== undefined;

const isIdle = () => {
  const now = Date.now();
  return now - lastActivity > (DECO_IDLE_THRESHOLD_MINUTES! * ONE_MINUTE_MS);
};
const checkActivity = async (notificationUrl: URL) => {
  if (isIdle()) {
    console.log(`env is considered idle notifying ${notificationUrl}`);
    await fetch(notificationUrl, { method: "POST" }).catch(
      (_err) => {},
    );
  }
};

let lastActivity = Date.now();
export const activityMonitor: MiddlewareHandler = async (_ctx, next) => {
  if (shouldReportActivity) lastActivity = Date.now();
  await next();
};

export const createIdleHandler = (site: string, envName: string): Handler => {
  shouldReportActivity = shouldReportActivity && typeof site === "string" &&
    typeof envName === "string";
  if (
    shouldReportActivity && DECO_IDLE_NOTIFICATION_ENDPOINT
  ) {
    const notificationUrl = new URL(DECO_IDLE_NOTIFICATION_ENDPOINT);
    notificationUrl.searchParams.set("site", site);
    notificationUrl.searchParams.set("name", envName);
    setInterval(() => checkActivity(notificationUrl), ONE_MINUTE_MS);
  }
  return () =>
    new Response(`${shouldReportActivity && isIdle()}`, {
      status: 200,
      headers: {
        "x-deco-idle-threshold-ms": DECO_IDLE_THRESHOLD_MINUTES
          ? `${DECO_IDLE_THRESHOLD_MINUTES}`
          : "",
        "x-deco-idle-notification-endpoint": DECO_IDLE_NOTIFICATION_ENDPOINT ??
          "",
      },
    });
};
