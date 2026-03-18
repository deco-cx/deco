import { LRUCache } from "npm:lru-cache@10.2.0";
import {
  assertCanBeCached,
  assertNoOptions,
  baseCache,
  withCacheNamespace,
} from "./utils.ts";

const MEMORY_CACHE_MAX_SIZE = parseInt(
  Deno.env.get("MEMORY_CACHE_MAX_SIZE") ?? "268435456", // 256 MB
);
const MEMORY_CACHE_MAX_ITEMS = parseInt(
  Deno.env.get("MEMORY_CACHE_MAX_ITEMS") ?? "2048",
);

interface CacheEntry {
  body: Uint8Array;
  headers: [string, string][];
}

function createInMemoryCache(): CacheStorage {
  const store = new LRUCache<string, CacheEntry>({
    max: MEMORY_CACHE_MAX_ITEMS,
    maxSize: MEMORY_CACHE_MAX_SIZE,
    sizeCalculation: (entry) => entry.body.length,
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
          });
        },
        put: async (
          request: RequestInfo | URL,
          response: Response,
        ): Promise<void> => {
          const req = new Request(request);
          assertCanBeCached(req, response);
          if (!response.body) return;
          const cacheKey = await requestURLSHA1(request);
          const body = new Uint8Array(await response.arrayBuffer());
          const headers: [string, string][] = [...response.headers.entries()];
          store.set(cacheKey, { body, headers });
        },
      });
    },
  };

  return caches;
}

export const caches = createInMemoryCache();
