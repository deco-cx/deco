import { LRUCache } from "npm:lru-cache@10.2.0";
import { type ObservableResult, ValueType } from "../../deps.ts";
import { logger } from "../../observability/otel/config.ts";
import { meter } from "../../observability/otel/metrics.ts";
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
const CACHE_MAX_ITEMS = parseInt(
  Deno.env.get("CACHE_MAX_ITEMS") ?? "4096",
); // max number of items in the LRU cache (bounds internal typed array memory)
const CACHE_TTL_AUTOPURGE = Deno.env.get("CACHE_TTL_AUTOPURGE") === "true"; // creates a cron for each element in the cache to automatically delete expired items
const CACHE_TTL_RESOLUTION = parseInt(
  Deno.env.get("CACHE_TTL_RESOLUTION") ?? "1000",
); // updates the lru cache timer every 1 second
// Additional time-to-live increment in milliseconds to extend the cache expiration beyond the response's Expires header.
// If not set, the cache will use only the expiration timestamp from response headers
const STALE_TTL_PERIOD = parseInt(
  Deno.env.get("STALE_TTL_PERIOD") ?? "30000",
);

const lruEvictions = meter.createCounter("lru.evictions_total", {
  unit: "1",
  valueType: ValueType.DOUBLE,
  description: "Number of LRU cache evictions.",
});

const lruSizeGauge = meter.createObservableGauge("lru.size_bytes", {
  unit: "By",
  valueType: ValueType.DOUBLE,
  description: "Current LRU cache size in bytes.",
});

const lruItemsGauge = meter.createObservableGauge("lru.item_count", {
  unit: "1",
  valueType: ValueType.DOUBLE,
  description: "Current number of items in the LRU cache.",
});

const lruFillRatioGauge = meter.createObservableGauge("lru.fill_ratio", {
  valueType: ValueType.DOUBLE,
  description:
    "LRU cache fill ratio (0-1). Above 0.9 eviction pressure is high.",
});

const lruHits = meter.createCounter("lru.hits_total", {
  unit: "1",
  valueType: ValueType.DOUBLE,
  description: "Number of LRU cache hits.",
});

const lruMisses = meter.createCounter("lru.misses_total", {
  unit: "1",
  valueType: ValueType.DOUBLE,
  description: "Number of LRU cache misses.",
});

// Track active LRU instances per cache name for observable gauges
const lruInstances = new Map<string, LRUCache<string, boolean>>();

lruSizeGauge.addCallback((result: ObservableResult) => {
  for (const [cacheName, cache] of lruInstances) {
    result.observe(cache.calculatedSize ?? 0, { cache: cacheName });
  }
});

lruItemsGauge.addCallback((result: ObservableResult) => {
  for (const [cacheName, cache] of lruInstances) {
    result.observe(cache.size, { cache: cacheName });
  }
});

lruFillRatioGauge.addCallback((result: ObservableResult) => {
  for (const [cacheName, cache] of lruInstances) {
    const ratio = CACHE_MAX_SIZE > 0
      ? (cache.calculatedSize ?? 0) / CACHE_MAX_SIZE
      : 0;
    result.observe(ratio, { cache: cacheName });
  }
});

const cacheOptions = (cache: Cache, cacheName: string) => (
  {
    max: CACHE_MAX_ITEMS,
    maxSize: CACHE_MAX_SIZE,
    ttlAutopurge: CACHE_TTL_AUTOPURGE,
    ttlResolution: CACHE_TTL_RESOLUTION,
    dispose: (_value: boolean, key: string, reason: string) => {
      if (reason === "evict") {
        lruEvictions.add(1, { cache: cacheName });
      }
      cache.delete(key).catch((err) => {
        logger.warn(
          `lru dispose failed to delete key from backing cache: ${err}`,
          { cache: cacheName },
        );
      });
    },
  }
);

function createLruCacheStorage(cacheStorageInner: CacheStorage): CacheStorage {
  const caches = createBaseCacheStorage(
    cacheStorageInner,
    (cacheName, cacheInner, requestURLSHA1) => {
      const fileCache = new LRUCache(cacheOptions(cacheInner, cacheName));
      lruInstances.set(cacheName, fileCache);
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
            lruHits.add(1, { cache: cacheName });
            const result = cacheInner.match(cacheKey);
            return result;
          }
          lruMisses.add(1, { cache: cacheName });
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

          // Calculate the time-to-live (TTL) for the cached item:
          // - If STALE_TTL_PERIOD is configured, add it to the expiration time from the response headers
          //   This allows extending the cache lifetime beyond what the server specifies and serves stale content during this extra time
          // The staleness is detect at the loader level because it checks for the expires header, that remains untouched here, the idea is to serve stale content but with expired header
          const ttl = (expirationTimestamp - Date.now()) + STALE_TTL_PERIOD;

          const cacheKey = await requestURLSHA1(request);
          const length = response.headers.get("Content-Length");
          if (!length || length == "0") {
            return;
          }
          fileCache.set(cacheKey, true, {
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
