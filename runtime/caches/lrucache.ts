import { LRUCache } from "npm:lru-cache@10.2.0";
import { numToUint8Array, uint8ArrayToNum } from "../utils.ts";
import {
  assertCanBeCached,
  assertNoOptions,
  withCacheNamespace,
} from "./common.ts";

export const MAX_CACHE_SIZE = parseInt(
  Deno.env.get("MAX_CACHE_SIZE") ?? "1073824",
); // 1 GB max size of cache
export const MAX_AGE_S = parseInt(Deno.env.get("CACHE_MAX_AGE_S") ?? "60"); // 60 seconds
export const TTL_AUTOPURGE = Deno.env.get("TTL_AUTOPURGE") !== "false"; // automatically delete expired items
export const ALLOW_STALE = Deno.env.get("ALLOW_STALE") !== "false"; // automatically allow stale
export const TTL_RESOLUTION = parseInt(
  Deno.env.get("TTL_RESOLUTION") ?? "30000",
); // check for expired items every 30 seconds

const cacheOptions = (cache: Cache) => (
  {
    maxSize: MAX_CACHE_SIZE,
    ttlAutopurge: TTL_AUTOPURGE,
    ttlResolution: TTL_RESOLUTION,
    allowStale: ALLOW_STALE,
    sizeCalculation: (value: Uint8Array) => {
      return uint8ArrayToNum(value); // return the length of the array
    },
    dispose: async (_value: Uint8Array, key: string) => {
      await cache.delete(key);
    },
  }
);

const NOT_IMPLEMENTED = () => {
  throw new Error("Not Implemented");
};

function createLruCacheStorage(cacheStorageInner: CacheStorage): CacheStorage {
  const caches: CacheStorage = {
    delete: NOT_IMPLEMENTED,
    has: NOT_IMPLEMENTED,
    keys: NOT_IMPLEMENTED,
    match: NOT_IMPLEMENTED,
    open: async (cacheName: string): Promise<Cache> => {
      const cacheInner = await cacheStorageInner.open(cacheName);
      const fileCache = new LRUCache(cacheOptions(cacheInner));
      const requestURLSHA1 = (request: RequestInfo | URL) => withCacheNamespace(cacheName)(request).then((key) => 'http://localhost:8000/' + key);
      const cache = Promise.resolve({
        add: NOT_IMPLEMENTED,
        addAll: NOT_IMPLEMENTED,
        delete: async (
          request: RequestInfo | URL,
          options?: CacheQueryOptions,
        ): Promise<boolean> => {
          const cacheKey = await requestURLSHA1(request);
          cacheInner.delete(cacheKey, options);
          return fileCache.delete(cacheKey);
        },
        keys: NOT_IMPLEMENTED,
        match: async (
          request: RequestInfo | URL,
          options?: CacheQueryOptions,
        ): Promise<Response | undefined> => {
          assertNoOptions(options);
          const cacheKey = await requestURLSHA1(request);
          if (fileCache.has(cacheKey)) {
            fileCache.get(cacheKey);
            const result = cacheInner.match(cacheKey);
            if (!result) {
              // innercache miss
              fileCache.delete(cacheKey);
            }
            return result;
          }
          return undefined;
        },
        matchAll: NOT_IMPLEMENTED,
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
          if (length) {
            if (length == "0") {
              return;
            } else {
              fileCache.set(cacheKey, numToUint8Array(parseInt(length)), {
                size: parseInt(length),
                ttl,
              });
              return cacheInner.put(cacheKey, new Response(response.body, {
                headers: new Headers({...response.headers,
                  "Expires": new Date(Date.now() + (MAX_AGE_S * 1e3))
                  .toUTCString(),
                  "Content-Length": length
                })
              }));
            }
          } else {
            const body = await response.arrayBuffer();
            fileCache.set(cacheKey, numToUint8Array(body.byteLength), { ttl });
            return cacheInner.put(cacheKey, new Response(body, {
              headers: new Headers({...response.headers,
                "Expires": new Date(Date.now() + (MAX_AGE_S * 1e3))
                  .toUTCString(),
                "Content-Length": `${body.byteLength}`
              })
            }));
          }
        },
      });
      return cache;
    },
  };

  return caches;
}

export const caches = (cache: CacheStorage) => createLruCacheStorage(cache);
