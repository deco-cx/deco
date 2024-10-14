import { LRUCache } from "npm:lru-cache@10.2.0";
import {
  assertCanBeCached,
  assertNoOptions,
  baseCache,
  createBaseCacheStorage,
} from "./utils.ts";

// keep compatible with old variable name
const CACHE_MAX_SIZE = parseInt(
  Deno.env.get("CACHE_MAX_SIZE") ?? Deno.env.get("MAX_CACHE_SIZE") ??
    "1073741824",
); // 1 GB max size of cache
const CACHE_TTL_AUTOPURGE = Deno.env.get("CACHE_TTL_AUTOPURGE") !== "false"; // automatically delete expired items
const CACHE_ALLOW_STALE = Deno.env.get("CACHE_ALLOW_STALE") !== "false"; // automatically allow stale
const CACHE_TTL_RESOLUTION = parseInt(
  Deno.env.get("CACHE_TTL_RESOLUTION") ?? "30000",
); // check for expired items every 30 seconds

const cacheOptions = (cache: Cache) => (
  {
    maxSize: CACHE_MAX_SIZE,
    ttlAutopurge: CACHE_TTL_AUTOPURGE,
    ttlResolution: CACHE_TTL_RESOLUTION,
    allowStale: CACHE_ALLOW_STALE,
    dispose: async (_value: Uint8Array, key: string) => {
      await cache.delete(key);
    },
  }
);

function createLruCacheStorage(cacheStorageInner: CacheStorage): CacheStorage {
  const caches = createBaseCacheStorage(
    cacheStorageInner,
    (_cacheName, cacheInner, requestURLSHA1) => {
      const fileCache = new LRUCache(cacheOptions(cacheInner));
      return Promise.resolve({
        ...baseCache,
        delete: async (
          request: RequestInfo | URL,
          options?: CacheQueryOptions,
        ): Promise<boolean> => {
          const cacheKey = await requestURLSHA1(request);
          cacheInner.delete(cacheKey, options);
          return fileCache.delete(cacheKey);
        },
        match: async (
          request: RequestInfo | URL,
          options?: CacheQueryOptions,
        ): Promise<Response | undefined> => {
          assertNoOptions(options);
          const cacheKey = await requestURLSHA1(request);
          if (fileCache.has(cacheKey)) {
            fileCache.get(cacheKey);
            const result = cacheInner.match(cacheKey);
            return result;
          }
          return undefined;
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

          const expirationTimestamp = Date.parse(
            response.headers.get("expires") ?? "",
          );

          const ttl = expirationTimestamp - Date.now();

          const cacheKey = await requestURLSHA1(request);
          const length = response.headers.get("Content-Length");
          if (!length || length == "0") {
            return;
          }
          fileCache.set(cacheKey, new Uint8Array(), {
            size: parseInt(length),
            ttl,
          });
          return cacheInner.put(cacheKey, response);
        },
      });
    },
  );
  return caches;
}

export const caches = (cache: CacheStorage) => createLruCacheStorage(cache);
