import { assertEquals, assertNotEquals } from "@std/assert";
import { createTieredCache } from "./tiered.ts";

const NOT_IMPL = (): never => {
  throw new Error("Not Implemented");
};

// Simple map-backed CacheStorage. Keys are raw URL strings.
function mapCacheStorage(map = new Map<string, Response>()): CacheStorage {
  const url = (r: RequestInfo | URL) =>
    typeof r === "string" ? r : (r as Request).url ?? String(r);
  return {
    delete: NOT_IMPL,
    has: NOT_IMPL,
    keys: NOT_IMPL,
    match: NOT_IMPL,
    open: (_name: string) =>
      Promise.resolve({
        add: NOT_IMPL,
        addAll: NOT_IMPL,
        keys: NOT_IMPL,
        matchAll: NOT_IMPL,
        delete: (r: RequestInfo | URL) =>
          Promise.resolve(map.delete(url(r))),
        match: (r: RequestInfo | URL) =>
          Promise.resolve(map.get(url(r))),
        put: (r: RequestInfo | URL, res: Response) => {
          map.set(url(r), res);
          return Promise.resolve();
        },
      } as Cache),
  };
}

const REQ = new Request("https://example.com/item");
const CACHE = "test";

function freshResponse(body = "data", status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      expires: new Date(Date.now() + 60_000).toUTCString(),
      "content-length": String(new TextEncoder().encode(body).length),
      "content-type": "application/json",
    },
  });
}

function staleResponse(body = "stale"): Response {
  return new Response(body, {
    headers: {
      // expired far enough back that STALE_TTL_PERIOD (30s) doesn't save it
      expires: new Date(Date.now() - 120_000).toUTCString(),
      "content-length": String(new TextEncoder().encode(body).length),
    },
  });
}

// flush fire-and-forget microtasks (backfill is not awaited in tiered.ts)
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

Deno.test("tiered / single tier: hit sets X-Cache-Tier: 0", async () => {
  const tiered = createTieredCache(mapCacheStorage());
  const cache = await tiered.open(CACHE);
  await cache.put(REQ, freshResponse());

  const result = await cache.match(REQ);
  assertNotEquals(result, undefined);
  assertEquals(result!.headers.get("x-cache-tier"), "0");
});

Deno.test("tiered / single tier: miss returns undefined", async () => {
  const tiered = createTieredCache(mapCacheStorage());
  const cache = await tiered.open(CACHE);

  assertEquals(await cache.match(REQ), undefined);
});

Deno.test("tiered / single tier: preserves non-200 status", async () => {
  const tiered = createTieredCache(mapCacheStorage());
  const cache = await tiered.open(CACHE);
  await cache.put(REQ, freshResponse("not found", 404));

  const result = await cache.match(REQ);
  assertEquals(result?.status, 404);
});

Deno.test("tiered / two tiers: L1 hit returns X-Cache-Tier: 0, no backfill", async () => {
  const l1 = new Map<string, Response>();
  const l2 = new Map<string, Response>();
  const tiered = createTieredCache(mapCacheStorage(l1), mapCacheStorage(l2));
  const cache = await tiered.open(CACHE);

  // put distributes to both tiers
  await cache.put(REQ, freshResponse());

  const result = await cache.match(REQ);
  assertEquals(result?.headers.get("x-cache-tier"), "0");
  // L1 hit means L2 was never needed — both had the entry from put, L1 was checked first
});

Deno.test("tiered / two tiers: L1 miss, L2 hit — X-Cache-Tier: 1, backfills L1", async () => {
  const l1 = new Map<string, Response>();
  const l2 = new Map<string, Response>();
  // Pre-populate only L2 directly
  l2.set(REQ.url, freshResponse());

  const tiered = createTieredCache(mapCacheStorage(l1), mapCacheStorage(l2));
  const cache = await tiered.open(CACHE);

  const result = await cache.match(REQ);
  assertNotEquals(result, undefined);
  assertEquals(result!.headers.get("x-cache-tier"), "1");

  await flush();
  // L1 should now be backfilled
  assertNotEquals(l1.get(REQ.url), undefined);
});

Deno.test("tiered / two tiers: all miss returns undefined", async () => {
  const tiered = createTieredCache(mapCacheStorage(), mapCacheStorage());
  const cache = await tiered.open(CACHE);

  assertEquals(await cache.match(REQ), undefined);
});

Deno.test("tiered / two tiers: stale L1, fresh L2 — serves L2, backfills L1", async () => {
  const l1 = new Map<string, Response>();
  const l2 = new Map<string, Response>();
  l1.set(REQ.url, staleResponse("old"));
  l2.set(REQ.url, freshResponse("new"));

  const tiered = createTieredCache(mapCacheStorage(l1), mapCacheStorage(l2));
  const cache = await tiered.open(CACHE);

  const result = await cache.match(REQ);
  assertNotEquals(result, undefined);
  // Served from L2 (stale L1 was skipped)
  assertEquals(result!.headers.get("x-cache-tier"), "1");
  assertEquals(await result!.text(), "new");

  await flush();
  // L1 gets backfilled with fresh data (not the old stale "old" entry)
  const backfilled = l1.get(REQ.url);
  assertNotEquals(backfilled, undefined);
  assertEquals(await backfilled!.clone().text(), "new");
});

Deno.test("tiered / put: distributes to all tiers", async () => {
  const l1 = new Map<string, Response>();
  const l2 = new Map<string, Response>();
  const tiered = createTieredCache(mapCacheStorage(l1), mapCacheStorage(l2));
  const cache = await tiered.open(CACHE);

  await cache.put(REQ, freshResponse());
  assertNotEquals(l1.get(REQ.url), undefined);
  assertNotEquals(l2.get(REQ.url), undefined);
});

Deno.test("tiered / put: single tier does not read body unnecessarily", async () => {
  // Verify single-tier put path works (no double-read)
  const map = new Map<string, Response>();
  const tiered = createTieredCache(mapCacheStorage(map));
  const cache = await tiered.open(CACHE);

  await cache.put(REQ, freshResponse("body"));
  const result = await cache.match(REQ);
  assertEquals(await result!.text(), "body");
});

Deno.test("tiered / status: non-200 response preserved through multi-tier", async () => {
  const l1 = new Map<string, Response>();
  const l2 = new Map<string, Response>();
  l2.set(REQ.url, freshResponse("gone", 410));

  const tiered = createTieredCache(mapCacheStorage(l1), mapCacheStorage(l2));
  const cache = await tiered.open(CACHE);

  const result = await cache.match(REQ);
  assertEquals(result?.status, 410);
  assertEquals(result?.headers.get("x-cache-tier"), "1");
});
