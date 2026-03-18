import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { caches as lruCache } from "./lrucache.ts";
import { caches as headersCache } from "./headerscache.ts";

const MAX_CACHE_SIZE = 1073741824;

const NOT_IMPLEMENTED = () => {
  throw new Error("Not Implemented");
};

const testCacheStorage = (
  map: Map<RequestInfo | URL, Response>,
): CacheStorage => {
  const getUrl = (request: RequestInfo | URL) =>
    (request as Request).url ?? request.toString();
  return (
    {
      delete: () => {
        map.clear();
        return Promise.resolve(true);
      },
      has: NOT_IMPLEMENTED,
      keys: NOT_IMPLEMENTED,
      match: NOT_IMPLEMENTED,
      open: () => {
        return (Promise.resolve({
          add: NOT_IMPLEMENTED,
          addAll: NOT_IMPLEMENTED,
          delete: (request) => {
            return Promise.resolve(Boolean(map.delete(getUrl(request))));
          },
          keys: NOT_IMPLEMENTED,
          match: (request) => {
            return Promise.resolve(map.get(getUrl(request)));
          },
          matchAll: NOT_IMPLEMENTED,
          put: (request, response) => {
            map.set(getUrl(request), response);
            return Promise.resolve();
          },
        } as Cache));
      },
    }
  );
};

const createRequest = (i: number) => new Request(`https://example.com/${i}`);

const CACHE_NAME = "test";

const baseTest = async (cacheStorageUT: CacheStorage) => {
  const cache = await headersCache(lruCache(cacheStorageUT)).open(CACHE_NAME);
  const response = () =>
    new Response("Hello, World!", {
      headers: { "Content-length": `${MAX_CACHE_SIZE / 2}` },
    });
  for (let i = 0; i < 5; i++) {
    const request = createRequest(i);
    await cache.put(request, response());
    assert(cache.match(request));
  }
  for (let i = 0; i < 3; i++) {
    const request = createRequest(i);
    const response = await cache.match(request);
    assertEquals(response, undefined);
  }
  for (let i = 3; i < 5; i++) {
    const request = createRequest(i);
    const response = await cache.match(request);
    assertNotEquals(response, undefined);
  }
};

Deno.test({
  name: "lru_cache_adapter",
  sanitizeResources: false,
  sanitizeOps: false,
}, async (t) => {
  await t.step(
    "test base scenario",
    async () => {
      await baseTest(testCacheStorage(new Map()));
    },
  );
});

Deno.test({
  name: "test one resource",
  sanitizeResources: false,
  sanitizeOps: false,
}, async (t) => {
  const testMap = new Map();
  const cache = await headersCache(lruCache(testCacheStorage(testMap))).open(
    CACHE_NAME,
  );
  await t.step(
    "test one resource without content-length",
    async () => {
      await cache.put(createRequest(0), new Response("Hello, World!"));
      const responseWithDiscoveredLength = await cache.match(createRequest(0));
      assertEquals(
        responseWithDiscoveredLength?.headers.get("content-length"),
        "13",
      );
    },
  );
  await t.step(
    "test one resource with content-length",
    async () => {
      await cache.put(
        createRequest(1),
        new Response("Hello, World!", {
          headers: { "content-length": "100" },
        }),
      );
      const responseWithContentLength = await cache.match(createRequest(1));
      assertEquals(
        responseWithContentLength?.headers.get("content-length"),
        "100",
      );
    },
  );
});

Deno.test({
  name: "webstandard_cache_with_adapter",
  sanitizeResources: false,
  sanitizeOps: false,
}, async (t) => {
  await t.step(
    "test base scenario",
    async () => {
      caches.delete(CACHE_NAME);
      await baseTest(caches);
    },
  );
});

// TODO TESTAR O CENARIO ONDE O RESPONSE N TEM LENGTH

// --- Lazy re-index tests ---
// Simulates a pod restart: new LRU instance wrapping the same underlying storage.
// Valid disk entries should be re-indexed; truly expired ones should be evicted.

const STALE_TTL_PERIOD_MS = parseInt(
  Deno.env.get("STALE_TTL_PERIOD") ?? "30000",
);

function reindexResponse(expiresOffset: number, body = "cached"): Response {
  const encoded = new TextEncoder().encode(body);
  return new Response(encoded, {
    headers: {
      expires: new Date(Date.now() + expiresOffset).toUTCString(),
      "content-length": String(encoded.length),
      "content-type": "application/json",
    },
  });
}

Deno.test({
  name: "lru_cache_lazy_reindex: valid entry is served after LRU restart",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const sharedMap = new Map();
  const sharedStorage = testCacheStorage(sharedMap);
  const req = new Request("https://example.com/reindex-valid");

  // Populate via first LRU instance (simulates writes from previous pod)
  const lru1 = lruCache(sharedStorage);
  const cache1 = await lru1.open(CACHE_NAME);
  await cache1.put(req, reindexResponse(60_000)); // expires in 60s

  // Simulate restart: new LRU, same underlying storage, cold index
  const lru2 = lruCache(sharedStorage);
  const cache2 = await lru2.open(CACHE_NAME);

  const result = await cache2.match(req);
  assertNotEquals(result, undefined, "should serve from disk on cold LRU");
});

Deno.test({
  name: "lru_cache_lazy_reindex: truly expired entry is evicted on access",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const sharedMap = new Map();
  const sharedStorage = testCacheStorage(sharedMap);
  const req = new Request("https://example.com/reindex-expired");

  // Pre-populate inner storage directly with a response that is so old
  // that even STALE_TTL_PERIOD cannot save it (expires > 30s ago).
  const lru1 = lruCache(sharedStorage);
  const cache1 = await lru1.open(CACHE_NAME);
  // Write a response that expires well beyond STALE_TTL_PERIOD in the past
  await cache1.put(req, reindexResponse(-(STALE_TTL_PERIOD_MS + 60_000)));

  // Simulate restart
  const lru2 = lruCache(sharedStorage);
  const cache2 = await lru2.open(CACHE_NAME);

  const result = await cache2.match(req);
  assertEquals(result, undefined, "expired entry should not be served");
});

Deno.test({
  name: "lru_cache_lazy_reindex: entry missing from disk is a miss",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const sharedStorage = testCacheStorage(new Map());
  const req = new Request("https://example.com/reindex-missing");

  const lru = lruCache(sharedStorage);
  const cache = await lru.open(CACHE_NAME);

  assertEquals(await cache.match(req), undefined);
});

Deno.test({
  name: "lru_cache_lazy_reindex: re-indexed entry stays accessible on subsequent accesses",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  // The LRU stores only presence (true), responses always come from inner.
  // What matters: after re-index the key is registered in the LRU and
  // subsequent accesses keep working without going through the cold path.
  const sharedMap = new Map();
  const req = new Request("https://example.com/reindex-cached");

  // Populate via first instance (simulates previous pod)
  const lru1 = lruCache(testCacheStorage(sharedMap));
  await (await lru1.open(CACHE_NAME)).put(req, reindexResponse(60_000));

  // Simulate restart: new LRU, same underlying storage
  const lru2 = lruCache(testCacheStorage(sharedMap));
  const cache2 = await lru2.open(CACHE_NAME);

  assertNotEquals(
    await cache2.match(req),
    undefined,
    "first access: re-indexed from inner storage",
  );
  assertNotEquals(
    await cache2.match(req),
    undefined,
    "second access: served via warm LRU path",
  );
});
