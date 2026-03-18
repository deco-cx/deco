import { assertEquals, assertNotEquals } from "@std/assert";
import { caches } from "./inMemoryCache.ts";

// Use unique cache names per test to avoid cross-test contamination
// from the shared singleton LRU store.
let seq = 0;
const nextCache = () => `inMemoryTest_${seq++}_${Date.now()}`;

const REQ = new Request("https://example.com/item");

Deno.test("inMemoryCache: preserves response body", async () => {
  const cache = await caches.open(nextCache());
  await cache.put(REQ, new Response("hello world"));
  const result = await cache.match(REQ);
  assertNotEquals(result, undefined);
  assertEquals(await result!.text(), "hello world");
});

Deno.test("inMemoryCache: preserves response status", async () => {
  const cache = await caches.open(nextCache());
  await cache.put(REQ, new Response("not found", { status: 404 }));
  const result = await cache.match(REQ);
  assertEquals(result?.status, 404);
});

Deno.test("inMemoryCache: preserves non-standard status codes", async () => {
  const cache = await caches.open(nextCache());
  await cache.put(REQ, new Response("gone", { status: 410 }));
  assertEquals((await cache.match(REQ))?.status, 410);
});

Deno.test("inMemoryCache: preserves response headers", async () => {
  const cache = await caches.open(nextCache());
  await cache.put(
    REQ,
    new Response("data", {
      headers: { "content-type": "application/json", "x-custom": "value" },
    }),
  );
  const result = await cache.match(REQ);
  assertEquals(result?.headers.get("content-type"), "application/json");
  assertEquals(result?.headers.get("x-custom"), "value");
});

Deno.test("inMemoryCache: miss returns undefined", async () => {
  const cache = await caches.open(nextCache());
  assertEquals(await cache.match(REQ), undefined);
});

Deno.test("inMemoryCache: delete removes entry", async () => {
  const cache = await caches.open(nextCache());
  await cache.put(REQ, new Response("data"));
  assertNotEquals(await cache.match(REQ), undefined);
  await cache.delete(REQ);
  assertEquals(await cache.match(REQ), undefined);
});

Deno.test("inMemoryCache: different requests are independent", async () => {
  const cache = await caches.open(nextCache());
  const req1 = new Request("https://example.com/1");
  const req2 = new Request("https://example.com/2");

  await cache.put(req1, new Response("one", { status: 200 }));
  await cache.put(req2, new Response("two", { status: 201 }));

  assertEquals((await cache.match(req1))?.status, 200);
  assertEquals((await cache.match(req2))?.status, 201);
});
