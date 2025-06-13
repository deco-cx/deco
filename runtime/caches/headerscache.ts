import {
  assertCanBeCached,
  assertNoOptions,
  baseCache,
  createBaseCacheStorage,
} from "./utils.ts";

const CACHE_MAX_AGE_S = parseInt(Deno.env.get("CACHE_MAX_AGE_S") ?? "60"); // 60 seconds

function createLruCacheStorage(cacheStorageInner: CacheStorage): CacheStorage {
  const caches = createBaseCacheStorage(
    cacheStorageInner,
    (_cacheName, cacheInner, requestURLSHA1) => {
      return Promise.resolve({
        ...baseCache,
        delete: async (
          request: RequestInfo | URL,
          options?: CacheQueryOptions,
        ): Promise<boolean> => {
          const cacheKey = await requestURLSHA1(request);
          return cacheInner.delete(cacheKey, options);
        },
        match: async (
          request: RequestInfo | URL,
          options?: CacheQueryOptions,
        ): Promise<Response | undefined> => {
          assertNoOptions(options);
          const cacheKey = await requestURLSHA1(request);
          return cacheInner.match(cacheKey);
        },
        put: async (
          request: RequestInfo | URL,
          response: Response,
        ): Promise<void> => {
          const req = new Request(request);
          assertCanBeCached(req, response);

          if (!response.body) {
            return;
          }
          const cacheKey = await requestURLSHA1(request);
          const length = response.headers.get("Content-Length");
          if (length) {
            if (length == "0") {
              return;
            } else {
              const expiresHeader = response.headers.get("expires");
              const ttl = (expiresHeader !== null && expiresHeader !== "")
                ? Date.parse(expiresHeader)
                : Date.now() + (CACHE_MAX_AGE_S * 1e3);
              console.log("ttl", ttl, expiresHeader, cacheKey);
              return cacheInner.put(
                cacheKey,
                new Response(response.body, {
                  headers: new Headers({
                    ...response.headers,
                    expires: new Date(ttl)
                      .toUTCString(),
                    "Content-Length": length,
                  }),
                }),
              );
            }
          }
          const body = await response.arrayBuffer();
          return cacheInner.put(
            cacheKey,
            new Response(body, {
              headers: new Headers({
                ...response.headers,
                expires: new Date(Date.now() + (CACHE_MAX_AGE_S * 1e3))
                  .toUTCString(),
                "Content-Length": `${body.byteLength}`,
              }),
            }),
          );
        },
      });
    },
  );
  return caches;
}

export const caches = (cache: CacheStorage) => createLruCacheStorage(cache);
