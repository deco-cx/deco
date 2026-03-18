import { LRUCache } from "npm:lru-cache@10.2.0";
import { ValueType } from "../../deps.ts";
import { logger } from "../../observability/otel/config.ts";
import { meter } from "../../observability/otel/metrics.ts";
import {
  assertCanBeCached,
  assertNoOptions,
  baseCache,
  withCacheNamespace,
} from "./utils.ts";

const MEMORY_CACHE_MAX_SIZE = parseInt(
  Deno.env.get("MEMORY_CACHE_MAX_SIZE") ?? "268435456", // 256 MB
) || 268435456;
const MEMORY_CACHE_MAX_ITEMS = parseInt(
  Deno.env.get("MEMORY_CACHE_MAX_ITEMS") ?? "2048",
) || 2048;
const CACHE_MAX_ENTRY_SIZE = parseInt(
  Deno.env.get("CACHE_MAX_ENTRY_SIZE") ?? "2097152", // 2 MB
) || 2097152;
// Minimum number of cache writes before a key is admitted to L1 (in-memory).
// Prevents one-hit wonders (bot traffic, rare URLs) from displacing hot keys.
// Default 3: a key must be written three times (i.e. accessed from L2 on separate requests)
// before it earns a spot in RAM.
const MEMORY_CACHE_MIN_HITS = parseInt(
  Deno.env.get("MEMORY_CACHE_MIN_HITS") ?? "3",
) || 3;

const l1EvictionCounter = meter.createCounter("l1_cache_eviction", {
  description: "number of entries evicted from the L1 in-memory cache",
  unit: "1",
  valueType: ValueType.DOUBLE,
});

interface CacheEntry {
  body: Uint8Array;
  headers: [string, string][];
  status: number;
}

function createInMemoryCache(): CacheStorage {
  let totalEvictions = 0;

  const store = new LRUCache<string, CacheEntry>({
    max: MEMORY_CACHE_MAX_ITEMS,
    maxSize: MEMORY_CACHE_MAX_SIZE,
    sizeCalculation: (entry) => entry.body.length,
    dispose: (_value, _key, reason) => {
      if (reason === "evict") {
        l1EvictionCounter.add(1);
        totalEvictions++;
        if (totalEvictions === 1 || totalEvictions % 100 === 0) {
          logger.warn(
            `l1_cache: ${totalEvictions} total evictions — L1 is full and dropping entries. ` +
              `Consider increasing MEMORY_CACHE_MAX_SIZE (current: ${MEMORY_CACHE_MAX_SIZE}) ` +
              `or MEMORY_CACHE_MAX_ITEMS (current: ${MEMORY_CACHE_MAX_ITEMS}).`,
          );
        }
      }
    },
  });

  // Admission filter: tracks how many times each key has been presented for storage.
  // A key must be seen MEMORY_CACHE_MIN_HITS times before it's actually stored in RAM.
  // The admission LRU is sized generously (4x items) since it holds only counters.
  const admissionCounts = new LRUCache<string, number>({
    max: MEMORY_CACHE_MAX_ITEMS * 4,
  });

  const caches: CacheStorage = {
    delete: () => {
      throw new Error("Not Implemented");
    },
    has: () => {
      throw new Error("Not Implemented");
    },
    keys: () => {
      throw new Error("Not Implemented");
    },
    match: () => {
      throw new Error("Not Implemented");
    },
    open: (cacheName: string): Promise<Cache> => {
      const requestURLSHA1 = withCacheNamespace(cacheName);
      return Promise.resolve({
        ...baseCache,
        delete: async (
          request: RequestInfo | URL,
          _options?: CacheQueryOptions,
        ): Promise<boolean> => {
          const cacheKey = await requestURLSHA1(request);
          admissionCounts.delete(cacheKey);
          return store.delete(cacheKey);
        },
        match: async (
          request: RequestInfo | URL,
          options?: CacheQueryOptions,
        ): Promise<Response | undefined> => {
          assertNoOptions(options);
          const cacheKey = await requestURLSHA1(request);
          const entry = store.get(cacheKey);
          if (!entry) return undefined;
          return new Response(entry.body as unknown as BodyInit, {
            headers: new Headers(entry.headers),
            status: entry.status,
          });
        },
        put: async (
          request: RequestInfo | URL,
          response: Response,
        ): Promise<void> => {
          const req = new Request(request);
          assertCanBeCached(req, response);
          if (!response.body) return;
          // Fast path: skip the body read entirely if Content-Length already tells us
          // the entry is too large. The loader always sets this header.
          const cl = parseInt(response.headers.get("content-length") ?? "0");
          if (cl > CACHE_MAX_ENTRY_SIZE) return;
          const cacheKey = await requestURLSHA1(request);

          // Admission filter: only promote to L1 after MEMORY_CACHE_MIN_HITS writes.
          const hits = (admissionCounts.get(cacheKey) ?? 0) + 1;
          if (hits < MEMORY_CACHE_MIN_HITS) {
            admissionCounts.set(cacheKey, hits);
            return;
          }
          // Key has earned its place — remove from admission tracker and store in RAM.
          admissionCounts.delete(cacheKey);

          const body = new Uint8Array(await response.arrayBuffer());
          if (body.length > CACHE_MAX_ENTRY_SIZE) return;
          const headers: [string, string][] = [...response.headers.entries()];
          store.set(cacheKey, { body, headers, status: response.status });
        },
      });
    },
  };

  return caches;
}

export const caches = createInMemoryCache();
