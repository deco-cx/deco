import { deleteCookie, setCookie } from "@std/http";

/**
 * Fast Preview — pull-based draft decofile.
 *
 * Studio serves the draft decofile (the merged `.deco/blocks/*.json` at the
 * branch head) from its GitHub-backed decofile API
 * (`GET <origin>/api/<org>/decofile/<virtualMcpId>/<branch>?token=…`); a
 * production site pulls it and renders its own real pages against it, as a
 * request-scoped SNAPSHOT of the release. This replaces the sandbox daemon
 * that used to sync the draft into a folder the site watched: no separate
 * process, no `/_sandbox/decofile`, just an HTTP pull.
 *
 * This module is the framework-agnostic half: token parsing, origin
 * validation, fetching, and version caching. Binding a resolved draft to a
 * request is done by the runtime (see `runtime/mod.ts`'s `prepareState`, which
 * swaps `state.release` for a `fromJSON`-backed provider of the pulled draft).
 *
 * Inert unless `DECO_ALLOWED_PREVIEW_HOSTS` (or the site-declared preview
 * hosts) names the request's host: upgrading the package must never be enough
 * to start fetching from the network and rendering unpublished content.
 * Host-scoping (rather than a boolean) exists because one deployment commonly
 * serves several domains — the preview domain may render drafts while the
 * production domain, on the same build, must ignore a `?__draft=` entirely.
 */

/**
 * A parsed `?__draft=` token: `<host[:port]><path[?query]>@<version>`.
 *
 * The token carries the AUTHORITY + PATH of the draft content API, never a
 * scheme — a full URL would be an SSRF vector, and the scheme is derived from
 * the matched domain instead. The path is REQUIRED and typically addresses
 * Studio's decofile API (`/api/<org>/decofile/<virtualMcpId>/<branch>?token=…`);
 * its query carries the signed draft grant.
 */
export interface DraftPointer {
  /** Content-API authority, e.g. `studio.decocms.com` or `localhost:4000`. */
  host: string;
  /** Path (+ query) on that authority serving the decofile JSON. */
  path: string;
  /** Opaque content version (the branch head sha / server ETag). Immutable → safe cache key. */
  version: string;
}

/** Lowercase DNS hostname. A single label is allowed — exact-host domain
 * entries (`localhost`, `local.studio.decocms.com`) can admit it. */
const HOST_RE =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;
const PORT_RE = /^[0-9]{1,5}$/;
const VERSION_RE = /^[A-Za-z0-9._-]{1,64}$/;
/** Rooted path with an optional query; conservative charset, no `@`/`#`/space. */
const PATH_RE = /^\/[A-Za-z0-9/_.%~=&?-]*$/;

/**
 * Parse `<host[:port]><path>@<version>`. Null on anything unexpected — callers
 * fall back to published content. Splits on the LAST `@` (neither the path
 * charset nor a signed token may contain one, so a stray `@` fails validation
 * rather than being half-read).
 */
export function parseDraftPointer(
  raw: string | null | undefined,
): DraftPointer | null {
  if (!raw) return null;
  const at = raw.lastIndexOf("@");
  if (at <= 0 || at === raw.length - 1) return null;
  const authorityAndPath = raw.slice(0, at);
  const version = raw.slice(at + 1);
  if (!VERSION_RE.test(version)) return null;

  const slash = authorityAndPath.indexOf("/");
  if (slash === -1) return null;
  const authority = authorityAndPath.slice(0, slash).toLowerCase();
  const path = authorityAndPath.slice(slash);
  if (!PATH_RE.test(path)) return null;

  const [host, port, extra] = authority.split(":");
  if (extra !== undefined) return null;
  if (!host || !HOST_RE.test(host)) return null;
  if (port !== undefined && !PORT_RE.test(port)) return null;

  return {
    host: port === undefined ? host : `${host}:${port}`,
    path,
    version,
  };
}

/**
 * Domains the draft content API may live under — deco-operated, so shipping
 * them as defaults adds no SSRF surface. `DECO_PREVIEW_API_DOMAINS` overrides
 * the whole list when set.
 *
 * Two entry shapes: a dot-prefixed entry is a suffix match with a guaranteed
 * label boundary (`evil-decocms.com` cannot pass `.decocms.com`); a bare entry
 * is an exact-host match (needed for `localhost` and dev origins, which no
 * suffix can admit). Order matters only for the local/port rule: the first
 * matching entry decides whether a port and `http` are allowed.
 */
export const DEFAULT_PREVIEW_API_DOMAINS = [
  "local.studio.decocms.com", // native/web dev origin (http, explicit port)
  "localhost",
  "127.0.0.1", // loopback dev — `localhost` can resolve to a different (IPv6) server
  ".localhost",
  ".decocms.com", // hosted Studio (decofile API) + preview daemons
];

type EnvLike = Record<string, string | undefined>;

/** Read a single env var, tolerating a missing `--allow-env` permission. */
function safeEnvGet(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
}

/**
 * Resolve the env source: an explicit object (tests / callers) or a lazy view
 * over the specific `Deno.env` vars this module reads. Materialising only the
 * keys we need avoids requiring blanket env access.
 */
function envOrDeno(env?: EnvLike): EnvLike {
  if (env) return env;
  return {
    DECO_PREVIEW_API_DOMAINS: safeEnvGet("DECO_PREVIEW_API_DOMAINS"),
    DECO_ALLOWED_PREVIEW_HOSTS: safeEnvGet("DECO_ALLOWED_PREVIEW_HOSTS"),
  };
}

function readApiDomains(env: EnvLike): string[] {
  const configured = (env.DECO_PREVIEW_API_DOMAINS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return configured.length > 0 ? configured : DEFAULT_PREVIEW_API_DOMAINS;
}

/**
 * Validate the token's authority against the configured domains and derive the
 * fetch origin, or null if no domain admits it.
 *
 * The token proposes, configuration disposes: only the hostname-suffix match
 * decides, so a caller can steer WHICH label under your domains, never which
 * domains. Scheme is derived — http for localhost-ish domains, https
 * otherwise — and an explicit port is allowed only there, so a public-domain
 * token cannot aim at odd ports.
 */
export function previewApiOriginForHost(
  authority: string,
  env?: EnvLike,
): string | null {
  const [host, port] = authority.toLowerCase().split(":");
  if (!host) return null;
  const domain = readApiDomains(envOrDeno(env)).find((d) =>
    d.startsWith(".") ? host.length > d.length && host.endsWith(d) : host === d
  );
  if (!domain) return null;
  // Local entries may carry an explicit port; public domains may not (a
  // public-domain token must not steer the fetch at odd ports).
  const local = domain === "localhost" ||
    domain === "127.0.0.1" ||
    domain.endsWith(".localhost") ||
    domain === "local.studio.decocms.com";
  if (port !== undefined && !local) return null;
  // Scheme is derived, never taken from the token. Plain-loopback dev hosts
  // are http; local.studio.decocms.com is the native app's TLS dev origin
  // (locally-trusted cert), so it — like every public domain — is https.
  const insecure = domain === "localhost" ||
    domain === "127.0.0.1" ||
    domain.endsWith(".localhost");
  return `${insecure ? "http" : "https"}://${host}${
    port === undefined ? "" : `:${port}`
  }`;
}

/**
 * Hosts declared by the site itself (the global `site` block's `previewHosts`),
 * installed once at setup time.
 *
 * MUST be fed from the setup-time base blocks, never from the request-time
 * (possibly drafted) release: an allowlist readable through the draft could be
 * rewritten by the very draft it gates.
 */
const G = globalThis as { __decoDraftHosts?: string[] };

/** Install the site-declared preview hosts. Called at setup by the site app. */
export function setDraftPreviewHosts(hosts: readonly unknown[]): void {
  G.__decoDraftHosts = hosts
    .filter((h): h is string => typeof h === "string")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Hosts allowed to render drafts.
 *
 * The site block is the expected source — the opt-in lives in the repo,
 * reviewed in a PR, versioned with branches. `DECO_ALLOWED_PREVIEW_HOSTS`
 * REPLACES it when set: an operational escape hatch (kill a bad value without
 * a deploy, add a machine-specific port) — not the primary configuration.
 */
function readAllowedHosts(env: EnvLike): string[] {
  const fromEnv = (env.DECO_ALLOWED_PREVIEW_HOSTS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : (G.__decoDraftHosts ?? []);
}

/**
 * Whether `host` (as seen on the request) may render drafts.
 *
 * Compared verbatim, port included — local dev is `localhost:3100`, not
 * `localhost`. The header is spoofable by a direct-to-origin request, but the
 * draft id is the actual capability; host-scoping bounds blast radius
 * (production domains stay inert), it is not a secret.
 */
export function isDraftHostAllowed(
  host: string | null | undefined,
  env?: EnvLike,
): boolean {
  if (!host) return false;
  return readAllowedHosts(envOrDeno(env)).includes(host.trim().toLowerCase());
}

/**
 * True when any host is allowed to preview. A cheap read callers use to gate
 * BEFORE touching the network, so an unconfigured site is fully inert. The
 * per-request host match happens later, in `isDraftHostAllowed`.
 */
export function isDraftPreviewEnabled(env?: EnvLike): boolean {
  return readAllowedHosts(envOrDeno(env)).length > 0;
}

/**
 * Draft cache. Bounded on purpose: a decofile is routinely multi-megabyte, so
 * an unbounded map would grow with every save until the process died.
 *
 * Keyed by the FULL source identity (`<host><path>@<version>`), not the version
 * alone: `version` is a branch-head sha in production (globally unique), but the
 * type accepts any short label (`v1`, a branch id) and one runtime can be
 * pointed at more than one draft source. Keying on host+path+version makes a
 * hit correct even when two sources reuse a version label.
 */
const MAX_CACHED_DRAFTS = 3;
const byKey = new Map<string, Record<string, unknown>>();

function draftCacheKey(p: DraftPointer): string {
  return `${p.host}${p.path}@${p.version}`;
}

function cacheDraft(key: string, blocks: Record<string, unknown>): void {
  byKey.delete(key);
  byKey.set(key, blocks);
  while (byKey.size > MAX_CACHED_DRAFTS) {
    const oldest = byKey.keys().next().value;
    if (oldest === undefined) break;
    byKey.delete(oldest);
  }
}

/** Test seam — drops every cached draft. */
export function clearDraftCache(): void {
  byKey.clear();
}

export interface ResolveDraftOptions {
  /** Raw `<host[:port]><path>@<version>` token from the request. */
  pointer: string | null | undefined;
  /** Defaults to `Deno.env`. */
  env?: EnvLike;
  /** Defaults to global `fetch`. Injected in tests. */
  fetchImpl?: typeof fetch;
}

/**
 * Resolve a draft token to a decofile, or null to render published content.
 *
 * Null on every failure path — disabled, malformed token, disallowed origin,
 * unreachable, non-2xx — because a draft that cannot be resolved must degrade
 * to published rather than break the page.
 */
export async function resolveDraftDecofile(
  options: ResolveDraftOptions,
): Promise<Record<string, unknown> | null> {
  const env = envOrDeno(options.env);
  if (readAllowedHosts(env).length === 0) return null;

  const parsed = parseDraftPointer(options.pointer);
  if (!parsed) return null;

  // Origin validation BEFORE the cache: a cached version must never be served
  // for a pointer whose authority the configuration would reject.
  const origin = previewApiOriginForHost(parsed.host, env);
  if (!origin) return null;

  const key = draftCacheKey(parsed);
  const cached = byKey.get(key);
  if (cached) return cached;

  const doFetch = options.fetchImpl ?? fetch;
  // The pointer's version rides along as `v=`, making the fetch URL fully
  // content-addressed (path + token + version). Today the server serves it
  // no-store either way — token-protected drafts are deliberately NOT
  // shared-cacheable. The param still earns its place: version-tagged access
  // logs, and it is the prerequisite for edge-validated caching later.
  const url = new URL(parsed.path, origin);
  url.searchParams.append("v", parsed.version);
  let res: Response;
  try {
    res = await doFetch(url.toString(), { cache: "no-store" });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let blocks: Record<string, unknown>;
  try {
    blocks = (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }

  cacheDraft(key, blocks);
  return blocks;
}

// ---------------------------------------------------------------------------
// Request-level resolution
// ---------------------------------------------------------------------------

/**
 * Cookie the draft pointer travels in across navigation and secondary requests
 * (client-fetched sections hitting `/deco/render` / `/deco/invoke`). Set on
 * entry when a `?__draft=` param arrives; read back off the raw Request here.
 */
export const DRAFT_COOKIE_NAME = "__deco_draft";
/** Query param that enters draft mode; `off` leaves it. */
export const DRAFT_QUERY_PARAM = "__draft";

/** Read one cookie value out of a raw `Cookie:` header. */
function readCookieValue(
  cookieHeader: string | null | undefined,
  name: string,
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      const raw = part.slice(eq + 1).trim();
      // A malformed `%` sequence makes `decodeURIComponent` throw; a bad cookie
      // must degrade to "no draft", never surface as an error to direct
      // callers of the exported reader.
      try {
        return decodeURIComponent(raw);
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * The draft pointer a raw Request is carrying: `?__draft=` wins, the cookie
 * carries navigation, `off` exits.
 */
export function draftPointerFromRequest(request: Request): string | null {
  const url = new URL(request.url);
  const param = url.searchParams.get(DRAFT_QUERY_PARAM);
  if (param === "off") return null;
  if (param) return param;
  return readCookieValue(request.headers.get("cookie"), DRAFT_COOKIE_NAME);
}

/** The request host to gate on, honouring the standard forwarding header. */
export function draftHostFromRequest(request: Request): string | null {
  return request.headers.get("x-forwarded-host") ??
    request.headers.get("host");
}

/**
 * Persist the draft pointer into the `__deco_draft` cookie so subsequent
 * navigation and client-fetched sections (`/deco/render`, `/deco/invoke`)
 * carry the same draft — those are separate HTTP requests and the swap lives
 * in per-request state that does not travel across the hop.
 *
 * `?__draft=off` always clears the cookie (an escape hatch that must work on
 * any host). Setting the cookie is gated on the same allowlist as rendering:
 * a stray `?__draft=` on a non-preview host leaves nothing behind.
 */
export function applyDraftCookie(
  request: Request,
  headers: Headers,
  env?: EnvLike,
): void {
  const url = new URL(request.url);
  const param = url.searchParams.get(DRAFT_QUERY_PARAM);
  if (param === null) return; // navigation via cookie — nothing to change.
  if (param === "off") {
    deleteCookie(headers, DRAFT_COOKIE_NAME, { path: "/" });
    return;
  }
  const e = envOrDeno(env);
  if (readAllowedHosts(e).length === 0) return;
  if (!isDraftHostAllowed(draftHostFromRequest(request), e)) return;
  setCookie(headers, {
    name: DRAFT_COOKIE_NAME,
    // Encoded so `readCookieValue`'s decode round-trips a pointer whose query
    // carries `&`/`=`; keeps the cookie octet-clean regardless of the grant.
    value: encodeURIComponent(param),
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: url.protocol === "https:",
  });
}

export interface ResolveDraftForRequestOptions {
  env?: EnvLike;
  fetchImpl?: typeof fetch;
}

/**
 * Resolve the draft decofile a raw Request is asking for, or null to fall back
 * to the published release.
 *
 * Applies the full gate — allowlist non-empty, request host allowed, pointer
 * valid, origin allowed, fetch OK — so the runtime can swap the release for
 * exactly the draft the request is asking for. Null means "render published".
 */
export async function resolveDraftForRequest(
  request: Request,
  options: ResolveDraftForRequestOptions = {},
): Promise<Record<string, unknown> | null> {
  const env = envOrDeno(options.env);
  if (readAllowedHosts(env).length === 0) return null;
  const pointer = draftPointerFromRequest(request);
  if (!pointer) return null;
  if (!isDraftHostAllowed(draftHostFromRequest(request), env)) return null;
  return resolveDraftDecofile({ pointer, env, fetchImpl: options.fetchImpl });
}
