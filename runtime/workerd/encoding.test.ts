import { assert, assertEquals, assertStrictEquals } from "@std/assert";
import { asDenoFetchResponse, installDenoFetch, sendAsIs } from "./encoding.ts";

const decoded = (coding: string, init: ResponseInit = {}) =>
  new Response("hello", {
    status: 200,
    ...init,
    headers: {
      "content-encoding": coding,
      "content-length": "25",
      "content-type": "text/html",
      ...init.headers as Record<string, string>,
    },
  });

Deno.test("asDenoFetchResponse drops the encoded-body headers", async () => {
  for (const coding of ["gzip", "br"]) {
    const res = asDenoFetchResponse(decoded(coding, { status: 201 }));
    assertEquals(res.headers.get("content-encoding"), null);
    assertEquals(res.headers.get("content-length"), null);
    assertEquals(res.headers.get("content-type"), "text/html");
    assertEquals(res.status, 201);
    assertEquals(await res.text(), "hello");
  }
});

Deno.test("asDenoFetchResponse keeps url and redirected", () => {
  const original = decoded("gzip");
  Object.defineProperties(original, {
    url: { value: "https://example.com/landed" },
    redirected: { value: true },
  });
  const res = asDenoFetchResponse(original);
  assertEquals(res.url, "https://example.com/landed");
  assertEquals(res.redirected, true);
  const twice = res.clone().clone();
  assertEquals(twice.url, "https://example.com/landed");
  assertEquals(twice.redirected, true);
  assertEquals(twice.headers.get("content-encoding"), null);
});

Deno.test("asDenoFetchResponse leaves other responses alone", () => {
  const plain = new Response("x");
  assertStrictEquals(asDenoFetchResponse(plain), plain);
  // workerd leaves these encoded: the headers must stay.
  for (const coding of ["x-gzip", "deflate", "GZIP", "Br", "zstd"]) {
    const other = decoded(coding);
    assertStrictEquals(asDenoFetchResponse(other), other);
  }
});

Deno.test("installDenoFetch wraps fetch once and honours manual", async () => {
  const g = globalThis as unknown as { fetch: typeof fetch };
  const real = g.fetch;
  try {
    g.fetch = (() => Promise.resolve(decoded("br"))) as typeof fetch;
    installDenoFetch();
    const wrapped = g.fetch;
    installDenoFetch();
    assertStrictEquals(g.fetch, wrapped);

    const res = await fetch("https://example.com");
    assertEquals(res.headers.get("content-encoding"), null);

    const manual = await fetch("https://example.com", {
      encodeResponseBody: "manual",
    } as RequestInit);
    assertEquals(manual.headers.get("content-encoding"), "br");

    // The decision is taken when the call starts, as workerd does.
    const init = { encodeResponseBody: "manual" } as Record<string, unknown>;
    const pending = fetch("https://example.com", init as RequestInit);
    init.encodeResponseBody = "automatic";
    assertEquals((await pending).headers.get("content-encoding"), "br");
  } finally {
    g.fetch = real;
  }
});

Deno.test("sendAsIs re-wraps only encoded bodies", async () => {
  const plain = new Response("x");
  assertStrictEquals(sendAsIs(plain), plain);
  const empty = new Response(null, {
    status: 304,
    headers: { "content-encoding": "br" },
  });
  assertStrictEquals(sendAsIs(empty), empty);

  const encoded = new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { "content-encoding": "br", "x-a": "1" },
  });
  const out = sendAsIs(encoded);
  assert(out !== encoded);
  assertEquals(out.headers.get("content-encoding"), "br");
  assertEquals(out.headers.get("x-a"), "1");
  assertEquals(
    new Uint8Array(await out.arrayBuffer()),
    new Uint8Array([1, 2, 3]),
  );
});
