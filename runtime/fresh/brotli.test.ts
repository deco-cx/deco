import { assertEquals } from "@std/assert";
import { brotliDecompressSync } from "node:zlib";
import { brotli } from "./brotli.ts";

const HTML = `<!DOCTYPE html><html><body>${
  "<p>origin egress</p>".repeat(200)
}</body></html>`;
const html = (body: string, headers: Record<string, string> = {}) =>
  new Response(body, {
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });
const req = (acceptEncoding: string, method = "GET") =>
  new Request("https://example.com/", {
    method,
    headers: { "accept-encoding": acceptEncoding },
  });

Deno.test("brotli-encodes HTML when the request lists gzip first (Cloudflare)", async () => {
  const res = await brotli(req("gzip, br"), html(HTML, { etag: '"abc"' }));
  assertEquals(res.headers.get("content-encoding"), "br");
  assertEquals(res.headers.get("vary"), "Accept-Encoding");
  assertEquals(res.headers.get("etag"), 'W/"abc"');
  const body = new Uint8Array(await res.arrayBuffer());
  assertEquals(new TextDecoder().decode(brotliDecompressSync(body)), HTML);
});

Deno.test("leaves responses alone when brotli does not apply", async () => {
  const cases: [Request, Response][] = [
    [req("gzip"), html(HTML)],
    [req("gzip, br;q=0"), html(HTML)],
    [req("gzip, br", "HEAD"), html(HTML)],
    [req("gzip, br"), html(HTML, { "content-encoding": "gzip" })],
    [req("gzip, br"), html(HTML, { "cache-control": "no-transform" })],
    [req("gzip, br"), html(HTML, { "content-type": "image/png" })],
    [req("gzip, br"), html("<p>tiny</p>")],
    [
      req("gzip, br"),
      new Response(HTML, {
        status: 206,
        headers: {
          "content-type": "text/html",
          "content-range": "bytes 0-99/5000",
        },
      }),
    ],
  ];
  for (const [request, response] of cases) {
    const encoding = response.headers.get("content-encoding");
    const res = await brotli(request, response);
    assertEquals(res.headers.get("content-encoding"), encoding);
  }
});
