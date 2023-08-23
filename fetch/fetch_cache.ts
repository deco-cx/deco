/**
 * Monkey patches fetch to allow caching interaction directly on the CDN.
 *
 * Heavily inspired on: https://developers.cloudflare.com/workers/runtime-apis/request/#incomingrequestcfproperties
 */
import { getCacheStorage } from "./caches.ts";

const getCacheKey = async (
  input: string | Request | URL,
  init?: DecoRequestInit,
) => {
  const url = typeof input === "string"
    ? input
    : input instanceof Request
    ? input.url
    : input.href;

  const headers = new Headers(
    init?.headers || (input instanceof Request ? input.headers : undefined),
  );

  const buffer = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(
      `url:${url},headers:${JSON.stringify([...headers.entries()])}`,
    ),
  );

  const hex = Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hex;
};

type CachingMode = "stale-while-revalidate";

type DecoInit = {
  cache: CachingMode;
  cacheTtlByStatus?: Array<{ from: number; to: number; ttl: number }>;
};

export type DecoRequestInit = RequestInit & { deco?: DecoInit };

const DEFAULT_TTL_BY_STATUS = [
  { from: 200, to: 299, ttl: 30 },
  { from: 400, to: 403, ttl: 1 },
  { from: 404, to: 404, ttl: 10 },
  { from: 500, to: 599, ttl: 0 },
] satisfies DecoInit["cacheTtlByStatus"];

const cache = await getCacheStorage()
  .then((caches) => caches.open("fetch"))
  .catch(() => null);

const inFuture = (maybeDate: string) => {
  try {
    return new Date(maybeDate) > new Date();
  } catch {
    return false;
  }
};

export const createFetch = (fetcher: typeof fetch): typeof fetch =>
  async function fetch(
    input: string | Request | URL,
    init?: DecoRequestInit,
  ) {
    const original = new Request(input, init);

    const url = new URL(original.url);
    const cacheTtlByStatus = init?.deco?.cacheTtlByStatus ??
      DEFAULT_TTL_BY_STATUS;
    const cacheable = (init?.method === "GET" || !init?.method) &&
      init?.deco?.cache === "stale-while-revalidate";
    const cacheKey = cacheable && await getCacheKey(input, init);

    // Set cache burst key into url so we always vary by url
    // This is ok when the developer filters headers/cookies
    // before forwarding to origin, which, is always the case in our loaders
    if (cacheKey) {
      url.searchParams.set("__decoCacheCB", cacheKey);
    }

    const request = new Request(url, { ...init, cache: undefined });

    const fetchAndCache = async () => {
      const response = await fetcher(request);

      const maxAge = cacheTtlByStatus.find((x) =>
        x.from <= response.status && response.status <= x.to
      )?.ttl ?? 0;

      if (cacheable && maxAge > 0) {
        const cached = new Response(response.body, response);

        cached.headers.set(
          "expires",
          new Date(Date.now() + (maxAge * 1e3)).toUTCString(),
        );
        cache?.put(request, cached.clone());
      }

      return response;
    };

    const matched = await cache?.match(request);

    if (!matched) {
      const fetched = await fetchAndCache();

      // fixme: Somehow, Deno bugs when tempering with ReadableStream.
      if (fetched.body instanceof ReadableStream) {
        return fetched;
      }

      const response = new Response(fetched.body, fetched);
      response.headers.set("x-cache", cacheable ? "MISS" : "DYNAMIC");
      return response;
    }

    const expires = matched.headers.get("expires");
    const isStale = !expires || !inFuture(expires);

    if (isStale) {
      fetchAndCache();
    }

    matched.headers.set("x-cache", isStale ? "STALE" : "HIT");

    return matched;
  };
