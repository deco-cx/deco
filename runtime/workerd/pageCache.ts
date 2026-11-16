/**
 * The page cache of a deco site on Cloudflare Workers.
 *
 * On Deno (Knative), pages are cached by the CDN in front of the site: deco
 * decides whether a page may be shared (`applyPageCacheDecision` in
 * runtime/middleware.ts sets a public `Cache-Control` only for a cacheable
 * page) and Cloudflare keeps it. A Worker route runs before that cache, so
 * nothing kept the Worker's own responses and every visit rendered the page.
 *
 * This puts the same cache inside the Worker, on the Cloudflare Cache API: it
 * stores what deco marks public and answers from the stored copy while it is
 * fresh, then stale while it revalidates (`stale-while-revalidate`) or when
 * the render fails (`stale-if-error`). Ported from the TanStack worker's page
 * cache (decocms/blocks, examples/tanstack-worker-smoke), minus its cache
 * profiles: here the site's own `Cache-Control` decides, as it does for the CDN.
 *
 * This module is evaluated with the Worker entry, before deco boots: keep it
 * free of deco imports (the names it shares with deco are copied below).
 */
import type { ExecutionContextLike } from "./context.ts";

/** deco's matcher cookies (`DECO_MATCHER_PREFIX`, blocks/matcher.ts). */
const MATCHER_COOKIE_PREFIX = "deco_matcher_";
/** deco's segment cookie (`DECO_SEGMENT`, runtime/middleware.ts). */
const SEGMENT_COOKIE = "deco_segment";
/** Draft preview (engine/decofile/draft.ts): never served from the cache. */
const DRAFT_QUERY_PARAM = "__draft";
const DRAFT_COOKIE = "__deco_draft";
/** Debug mode (runtime/middleware.ts). */
const DEBUG_QUERY_PARAM = "__d";
const DEBUG_COOKIE = "deco_debug";

/** Query parameters that never change a page, left out of the key. */
const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utmi_campaign",
  "utmi_page",
  "utmi_part",
  "fbclid",
  "gclid",
  "gclsrc",
  "dclid",
  "msclkid",
  "twclid",
  "li_fat_id",
  "mc_cid",
  "mc_eid",
  "ttclid",
  "srsltid",
]);

const STORED_AT = "x-deco-stored-at";
/** First path segment of every cache key (see `cacheKey`). */
const KEY_PREFIX = "__deco_page_cache";
const ORIGIN_CACHE_CONTROL = "x-deco-origin-cache-control";

export interface PageCacheOptions {
  /** Folded into the key: a new build never serves the previous one's pages.
   *  The decofile is embedded in the bundle, so the build covers content too. */
  version: string;
  /** Request cookies (name prefixes) that split the cache, besides deco's own
   *  matcher and segment cookies. */
  keyCookies?: string[];
  /** Request cookies (name prefixes) that skip the cache: the page renders and
   *  is neither read from nor written to it. Rarely needed: a page that renders
   *  shopper data on the server is already `no-store` (a `no-store` loader
   *  sets `vary.shouldCache = false`). */
  bypassCookies?: string[];
  /** The Cache API cache (default `caches.default`; tests inject one). */
  cache?: Cache | null;
  /** Clock in ms (tests). */
  now?: () => number;
}

/** Freshness windows in seconds, from the page's own `Cache-Control`. */
export interface CacheWindows {
  fresh: number;
  swr: number;
  sie: number;
}

/**
 * The windows of a response a shared cache may keep, or null: `private`,
 * `no-store` or `no-cache`, or no positive `s-maxage`/`max-age`.
 */
export function cacheWindows(cacheControl: string | null): CacheWindows | null {
  if (!cacheControl) return null;
  const directives = new Map<string, string>();
  for (const part of cacheControl.toLowerCase().split(",")) {
    const [name, value = ""] = part.trim().split("=");
    if (name) directives.set(name.trim(), value.trim());
  }
  for (const veto of ["private", "no-store", "no-cache"]) {
    if (directives.has(veto)) return null;
  }
  // delta-seconds are digits only (RFC 9111); cap the length so the stored
  // copy's max-age stays a plain integer.
  const seconds = (name: string) => {
    const raw = directives.get(name) ?? "";
    return /^\d{1,9}$/.test(raw) ? Number.parseInt(raw, 10) : 0;
  };
  const fresh = directives.has("s-maxage")
    ? seconds("s-maxage")
    : seconds("max-age");
  if (fresh <= 0) return null;
  // A shared cache may store such a response but never serve it stale.
  const noStale = directives.has("must-revalidate") ||
    directives.has("proxy-revalidate");
  return {
    fresh,
    swr: noStale ? 0 : seconds("stale-while-revalidate"),
    sie: noStale ? 0 : seconds("stale-if-error"),
  };
}

/** The device class the key splits on: Cloudflare's hint, else the UA. */
export function deviceClass(request: Request): string {
  const hint = request.headers.get("cf-device-type");
  if (hint === "mobile" || hint === "tablet" || hint === "desktop") return hint;
  const ua = request.headers.get("user-agent") ?? "";
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) {
    return "tablet";
  }
  if (/Mobi|iPhone|iPod|Android|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return "mobile";
  }
  return "desktop";
}

const parseCookies = (header: string | null): [string, string][] => {
  if (!header) return [];
  const out: [string, string][] = [];
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    out.push([part.slice(0, eq).trim(), part.slice(eq + 1).trim()]);
  }
  return out;
};

const startsWithAny = (name: string, prefixes: readonly string[]) =>
  prefixes.some((p) => p !== "" && name.startsWith(p));

/** Why a request never touches the cache, or null when it may. */
export function bypassReason(
  request: Request,
  bypassCookies: readonly string[] = [],
): string | null {
  if (request.method !== "GET") return "method";
  if (request.headers.has("authorization")) return "authorization";
  const url = new URL(request.url);
  // deco's own endpoints (invoke, editor, meta) keep their own caching;
  // lazily rendered sections are pages and do go through the cache.
  if (
    (url.pathname.startsWith("/live/") || url.pathname.startsWith("/deco/")) &&
    url.pathname !== "/deco/render"
  ) {
    return "deco-endpoint";
  }
  if (url.pathname === "/.decofile") return "deco-endpoint";
  if (url.searchParams.has(DRAFT_QUERY_PARAM)) return "draft";
  if (url.searchParams.has(DEBUG_QUERY_PARAM)) return "debug";
  for (const [name] of parseCookies(request.headers.get("cookie"))) {
    if (name === DRAFT_COOKIE) return "draft";
    if (name === DEBUG_COOKIE) return "debug";
    if (startsWithAny(name, bypassCookies)) return "cookie";
  }
  return null;
}

/**
 * The cache key: the URL without its fragment and tracking parameters, plus
 * the version, the device class and the cookies that pick a variant (deco's
 * matcher and segment cookies, and `keyCookies`).
 */
export function cacheKey(
  request: Request,
  { version, keyCookies = [] }: Pick<
    PageCacheOptions,
    "version" | "keyCookies"
  >,
): Request {
  const key = new URL(request.url);
  key.hash = "";
  for (const name of [...key.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(name.toLowerCase())) key.searchParams.delete(name);
  }
  const variant = parseCookies(request.headers.get("cookie"))
    .filter(([name]) =>
      name === SEGMENT_COOKIE ||
      name.startsWith(MATCHER_COOKIE_PREFIX) ||
      startsWithAny(name, keyCookies)
    )
    .map(([name, value]) => `${name}=${value}`)
    .sort();
  // The metadata goes in a path prefix with a fixed number of encoded segments,
  // never in the query: a page's own `?__v=` can't collide with it.
  const meta = [version, deviceClass(request), variant.join(";")]
    .map(encodeURIComponent)
    .join("/");
  key.pathname = `/${KEY_PREFIX}/${meta}${key.pathname}`;
  return new Request(key.toString(), { method: "GET" });
}

/** Why a rendered response can't be shared, or null when it can. */
function notStorable(response: Response): string | null {
  if (response.status !== 200) return `status:${response.status}`;
  if (response.headers.has("set-cookie")) return "set-cookie";
  // deco answers uncompressed and Cloudflare encodes on the way out; an encoded
  // body would be served to clients that didn't ask for that encoding.
  if (response.headers.has("content-encoding")) return "content-encoding";
  const vary = (response.headers.get("vary") ?? "").toLowerCase();
  const varies = vary.split(",").map((v) => v.trim()).filter(Boolean);
  if (varies.some((v) => v !== "accept-encoding")) return "vary";
  if (!cacheWindows(response.headers.get("cache-control"))) {
    return "cache-control";
  }
  return null;
}

const withHeaders = (
  response: Response,
  headers: Record<string, string>,
): Response => {
  const out = new Response(response.body, response);
  for (const [name, value] of Object.entries(headers)) {
    out.headers.set(name, value);
  }
  return out;
};

/** Keys being revalidated in this isolate (stale-while-revalidate). */
const revalidating = new Set<string>();

const defaultCache = (): Cache | null => {
  const storage = (globalThis as { caches?: { default?: Cache } }).caches;
  return storage?.default ?? null;
};

/**
 * Answers `request` from the page cache, rendering with `render` on a miss.
 * Every answer carries `X-Cache` (`HIT`, `STALE-HIT`, `STALE-ERROR`, `MISS`
 * or `BYPASS`, with `X-Cache-Reason`).
 */
export async function servePage(
  request: Request,
  ctx: ExecutionContextLike,
  render: () => Promise<Response>,
  options: PageCacheOptions,
): Promise<Response> {
  const bypass = bypassReason(request, options.bypassCookies);
  const cache = options.cache === undefined ? defaultCache() : options.cache;
  // Without a build id, entries would outlive a deploy: don't cache at all.
  const reason = bypass ??
    (!cache ? "no-cache-api" : !options.version ? "no-version" : null);
  if (reason || !cache) {
    const response = await render();
    return withHeaders(response, {
      "x-cache": "BYPASS",
      "x-cache-reason": reason ?? "no-cache-api",
    });
  }
  const now = options.now ?? Date.now;
  const key = cacheKey(request, options);

  const ageOf = (r: Response) => {
    const storedAt = Number(r.headers.get(STORED_AT) || "0");
    return storedAt > 0 ? (now() - storedAt) / 1000 : Number.POSITIVE_INFINITY;
  };
  const windowsOf = (r: Response) =>
    cacheWindows(r.headers.get(ORIGIN_CACHE_CONTROL));
  /** A stored copy as the visitor gets it: the page's own Cache-Control. */
  const serve = (
    copy: Response,
    decision: string,
    extra: Record<string, string> = {},
  ) => {
    const out = withHeaders(copy, {
      "cache-control": copy.headers.get(ORIGIN_CACHE_CONTROL) ?? "",
      "x-cache": decision,
      "x-cache-age": String(Math.round(ageOf(copy))),
      ...extra,
    });
    out.headers.delete(STORED_AT);
    out.headers.delete(ORIGIN_CACHE_CONTROL);
    // The Cache API adds its own status to a matched copy.
    out.headers.delete("cf-cache-status");
    return out;
  };
  const store = (response: Response, windows: CacheWindows) => {
    const copy = new Response(response.clone().body, response);
    copy.headers.set(
      ORIGIN_CACHE_CONTROL,
      response.headers.get("cache-control") ?? "",
    );
    // Keep the copy through the stale windows; freshness is ours to judge.
    copy.headers.set(
      "cache-control",
      `public, max-age=${windows.fresh + Math.max(windows.swr, windows.sie)}`,
    );
    copy.headers.set(STORED_AT, String(now()));
    const written = cache.put(key, copy).catch(() => {});
    ctx.waitUntil(written);
    return written;
  };

  const cached = await cache.match(key).catch(() => undefined);
  const cachedWindows = cached ? windowsOf(cached) : null;
  if (cached && cachedWindows) {
    const age = ageOf(cached);
    if (age < cachedWindows.fresh) return serve(cached, "HIT");
    if (age < cachedWindows.fresh + cachedWindows.swr) {
      // One revalidation per key at a time in this isolate. Only the key is
      // shared, never the render's promise (it belongs to its request).
      if (!revalidating.has(key.url)) {
        revalidating.add(key.url);
        ctx.waitUntil(
          render()
            .then((fresh) => {
              const windows = cacheWindows(fresh.headers.get("cache-control"));
              // Keep the key marked until the new copy is written, so no
              // request starts a second render against the old one.
              if (!notStorable(fresh) && windows) return store(fresh, windows);
            })
            .catch(() => {})
            .finally(() => revalidating.delete(key.url)),
        );
      }
      return serve(cached, "STALE-HIT");
    }
  }
  const staleOnError = (reason: string): Response | null => {
    if (!cached || !cachedWindows) return null;
    if (ageOf(cached) >= cachedWindows.fresh + cachedWindows.sie) return null;
    return serve(cached, "STALE-ERROR", { "x-cache-reason": reason });
  };

  let response: Response;
  try {
    response = await render();
  } catch (error) {
    const stale = staleOnError("render-error");
    if (stale) return stale;
    throw error;
  }
  if (response.status >= 500 || response.status === 429) {
    const stale = staleOnError(`status:${response.status}`);
    if (stale) return stale;
  }
  const unstorable = notStorable(response);
  if (unstorable) {
    return withHeaders(response, {
      "x-cache": "BYPASS",
      "x-cache-reason": unstorable,
    });
  }
  store(response, cacheWindows(response.headers.get("cache-control"))!);
  return withHeaders(response, { "x-cache": "MISS" });
}

/** Comma-separated env value as a list (empty entries dropped). */
export const listFromEnv = (value: unknown): string[] =>
  typeof value === "string"
    ? value.split(",").map((v) => v.trim()).filter(Boolean)
    : [];
