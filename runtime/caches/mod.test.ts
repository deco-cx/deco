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

// ---------------------------------------------------------------------------
// Lazy re-index tests
// ---------------------------------------------------------------------------

const STALE_TTL_PERIOD_MS = parseInt(
  Deno.env.get("STALE_TTL_PERIOD") ?? "30000",
);

/**
 * Helper: build a testCacheStorage where `open` returns a *shared* map so we
 * can simulate "disk" surviving an LRU restart.
 */
const sharedMapCacheStorage = (
  map: Map<RequestInfo | URL, Response>,
): CacheStorage => {
  const getUrl = (request: RequestInfo | URL) =>
    (request as Request).url ?? request.toString();
  return {
    delete: () => {
      map.clear();
      return Promise.resolve(true);
    },
    has: NOT_IMPLEMENTED,
    keys: NOT_IMPLEMENTED,
    match: NOT_IMPLEMENTED,
    open: () =>
      Promise.resolve({
        add: NOT_IMPLEMENTED,
        addAll: NOT_IMPLEMENTED,
        delete: (request: RequestInfo | URL) =>
          Promise.resolve(Boolean(map.delete(getUrl(request)))),
        keys: NOT_IMPLEMENTED,
        match: (request: RequestInfo | URL) =>
          Promise.resolve(map.get(getUrl(request))),
        matchAll: NOT_IMPLEMENTED,
        put: (request: RequestInfo | URL, response: Response) => {
          map.set(getUrl(request), response);
          return Promise.resolve();
        },
      } as Cache),
  };
};

Deno.test({
  name: "lru_cache_lazy_reindex: valid entry is served after LRU restart",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const disk = new Map<RequestInfo | URL, Response>();
  const storage1 = sharedMapCacheStorage(disk);

  // --- first LRU lifetime: put an entry ---
  const cache1 = await headersCache(lruCache(storage1)).open(CACHE_NAME);
  const futureExpires = new Date(Date.now() + 60_000).toUTCString();
  await cache1.put(
    createRequest(100),
    new Response("cached-body", {
      headers: {
        "content-length": "11",
        expires: futureExpires,
      },
    }),
  );

  // --- simulate pod restart: new LRU over the *same* disk map ---
  const storage2 = sharedMapCacheStorage(disk);
  const cache2 = await headersCache(lruCache(storage2)).open(CACHE_NAME);

  const response = await cache2.match(createRequest(100));
  assertNotEquals(response, undefined);
});

Deno.test({
  name: "lru_cache_lazy_reindex: truly expired entry is evicted on access",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const disk = new Map<RequestInfo | URL, Response>();
  const storage1 = sharedMapCacheStorage(disk);

  const cache1 = await headersCache(lruCache(storage1)).open(CACHE_NAME);
  // Expired well before now, even accounting for STALE_TTL_PERIOD
  const pastExpires = new Date(
    Date.now() - STALE_TTL_PERIOD_MS - 60_000,
  ).toUTCString();
  await cache1.put(
    createRequest(200),
    new Response("old-body", {
      headers: {
        "content-length": "8",
        expires: pastExpires,
      },
    }),
  );

  // --- simulate pod restart ---
  const storage2 = sharedMapCacheStorage(disk);
  const cache2 = await headersCache(lruCache(storage2)).open(CACHE_NAME);

  const response = await cache2.match(createRequest(200));
  assertEquals(response, undefined);
});

Deno.test({
  name: "lru_cache_lazy_reindex: entry missing from disk is a miss",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  // Empty disk — nothing was ever written
  const disk = new Map<RequestInfo | URL, Response>();
  const storage = sharedMapCacheStorage(disk);
  const cache = await headersCache(lruCache(storage)).open(CACHE_NAME);

  const response = await cache.match(createRequest(300));
  assertEquals(response, undefined);
});

Deno.test({
  name:
    "lru_cache_lazy_reindex: re-indexed entry stays accessible on subsequent accesses",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const disk = new Map<RequestInfo | URL, Response>();
  const storage1 = sharedMapCacheStorage(disk);

  const cache1 = await headersCache(lruCache(storage1)).open(CACHE_NAME);
  const futureExpires = new Date(Date.now() + 60_000).toUTCString();
  await cache1.put(
    createRequest(400),
    new Response("repeat-body", {
      headers: {
        "content-length": "11",
        expires: futureExpires,
      },
    }),
  );

  // --- simulate pod restart ---
  const storage2 = sharedMapCacheStorage(disk);
  const cache2 = await headersCache(lruCache(storage2)).open(CACHE_NAME);

  // First access triggers lazy re-index
  const first = await cache2.match(createRequest(400));
  assertNotEquals(first, undefined);

  // Second access should hit the LRU directly (no re-index needed)
  const second = await cache2.match(createRequest(400));
  assertNotEquals(second, undefined);
});
