import { assert, assertEquals } from "@std/assert";
import { maybeCompressResponseBody } from "./compression.ts";

const LARGE_HTML = `<!DOCTYPE html><html><body>${
  "<p>farm rio egress</p>".repeat(200)
}</body></html>`;

const htmlHeaders = () =>
  new Headers({ "content-type": "text/html; charset=utf-8" });

const req = (acceptEncoding?: string) =>
  new Request("https://example.com/", {
    headers: acceptEncoding ? { "accept-encoding": acceptEncoding } : {},
  });

const gunzip = async (
  body: ReadableStream<Uint8Array>,
): Promise<string> => {
  const stream = body.pipeThrough(
    new DecompressionStream("gzip") as unknown as ReadableWritablePair<
      Uint8Array,
      Uint8Array
    >,
  );
  return await new Response(stream).text();
};

Deno.test("compresses a large HTML string when gzip is accepted", async () => {
  const headers = htmlHeaders();
  const out = maybeCompressResponseBody(LARGE_HTML, headers, req("gzip"));

  assert(out instanceof ReadableStream, "expected a compressed stream");
  assertEquals(headers.get("content-encoding"), "gzip");
  assertEquals(headers.get("content-length"), null);
  assertEquals(headers.get("vary"), "Accept-Encoding");
  // Round-trips back to the original payload.
  assertEquals(await gunzip(out), LARGE_HTML);
});

Deno.test("preserves and compresses a streamed body", async () => {
  const headers = htmlHeaders();
  const source = new Response(LARGE_HTML).body!;
  const out = maybeCompressResponseBody(source, headers, req("br, gzip"));

  assert(out instanceof ReadableStream);
  assertEquals(headers.get("content-encoding"), "gzip");
  assertEquals(await gunzip(out), LARGE_HTML);
});

Deno.test("no-ops when the client does not accept gzip", () => {
  const headers = htmlHeaders();
  const out = maybeCompressResponseBody(LARGE_HTML, headers, req("br"));

  assertEquals(out, LARGE_HTML);
  assertEquals(headers.get("content-encoding"), null);
  assertEquals(headers.get("vary"), null);
});

Deno.test("no-ops when Accept-Encoding header is absent", () => {
  const headers = htmlHeaders();
  const out = maybeCompressResponseBody(LARGE_HTML, headers, req());
  assertEquals(out, LARGE_HTML);
  assertEquals(headers.get("content-encoding"), null);
});

Deno.test("skips non-compressible content types", () => {
  const headers = new Headers({ "content-type": "image/png" });
  const out = maybeCompressResponseBody(LARGE_HTML, headers, req("gzip"));
  assertEquals(out, LARGE_HTML);
  assertEquals(headers.get("content-encoding"), null);
});

Deno.test("never double-encodes an already-encoded body", () => {
  const headers = new Headers({
    "content-type": "text/html",
    "content-encoding": "br",
  });
  const out = maybeCompressResponseBody(LARGE_HTML, headers, req("gzip"));
  assertEquals(out, LARGE_HTML);
  assertEquals(headers.get("content-encoding"), "br");
});

Deno.test("skips tiny buffered payloads below the threshold", () => {
  const headers = htmlHeaders();
  const tiny = "<p>hi</p>";
  const out = maybeCompressResponseBody(tiny, headers, req("gzip"));
  assertEquals(out, tiny);
  assertEquals(headers.get("content-encoding"), null);
});

Deno.test("passes through a null body untouched", () => {
  const headers = htmlHeaders();
  const out = maybeCompressResponseBody(null, headers, req("gzip"));
  assertEquals(out, null);
  assertEquals(headers.get("content-encoding"), null);
});

Deno.test("compresses when gzip appears among several encodings", async () => {
  const headers = htmlHeaders();
  const out = maybeCompressResponseBody(
    LARGE_HTML,
    headers,
    req("deflate, gzip;q=1.0, *;q=0.5"),
  );
  assert(out instanceof ReadableStream);
  assertEquals(await gunzip(out), LARGE_HTML);
});

Deno.test("respects the DECO_RESPONSE_COMPRESSION opt-out", () => {
  const prev = Deno.env.get("DECO_RESPONSE_COMPRESSION");
  Deno.env.set("DECO_RESPONSE_COMPRESSION", "false");
  try {
    const headers = htmlHeaders();
    const out = maybeCompressResponseBody(LARGE_HTML, headers, req("gzip"));
    assertEquals(out, LARGE_HTML);
    assertEquals(headers.get("content-encoding"), null);
  } finally {
    if (prev === undefined) Deno.env.delete("DECO_RESPONSE_COMPRESSION");
    else Deno.env.set("DECO_RESPONSE_COMPRESSION", prev);
  }
});
