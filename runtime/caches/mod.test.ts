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
