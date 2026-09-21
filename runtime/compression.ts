/**
 * Response body compression for the SSR engine.
 *
 * The engine historically emits every HTML page **uncompressed** and relies on
 * the downstream CDN (e.g. Cloudflare) to compress on the edge → client leg.
 * That leaves the **origin → CDN** leg carrying the full uncompressed payload:
 * a page whose client-facing (brotli) size is ~120 KB ships ~2.8 MB from the
 * worker to the CDN on every MISS/revalidation. Since egress is billed on that
 * uncompressed origin → CDN transfer, this is the dominant infra cost per
 * pageview on large catalog pages.
 *
 * Cloudflare (and CDNs in general) send `Accept-Encoding: gzip` to the origin
 * and reuse a gzip origin response, so honoring it here collapses the origin →
 * CDN leg ~10-15x with no change to what the client ultimately receives.
 *
 * Scope: gzip only. `CompressionStream` supports `gzip`/`deflate` (not brotli),
 * and gzip is what Cloudflare requests from origins, so it is both sufficient
 * and universally accepted. The CDN is free to re-encode to brotli for clients.
 *
 * Opt-out: set `DECO_RESPONSE_COMPRESSION=false` (or `0`) to disable.
 */

/** Content types worth compressing (text-based / already-uncompressed). */
const COMPRESSIBLE_CONTENT_TYPE =
  /^(?:text\/|application\/(?:json|(?:ld\+|manifest\+)?json|javascript|ecmascript|xml|xhtml\+xml|rss\+xml|atom\+xml|vnd\.api\+json)|image\/svg\+xml)/i;

/**
 * Below this size (bytes) the gzip header/overhead outweighs the savings. Only
 * applied when the body length is known up-front (buffered string bodies);
 * streamed bodies are compressed unconditionally.
 */
const MIN_BYTES_TO_COMPRESS = 1024;

const isDisabled = (): boolean => {
  const flag = Deno.env.get("DECO_RESPONSE_COMPRESSION");
  return flag === "false" || flag === "0";
};

/** True when the client (usually the CDN) advertises gzip support. */
const acceptsGzip = (acceptEncoding: string | null): boolean =>
  !!acceptEncoding && /(?:^|,)\s*gzip\s*(?:;|,|$)/i.test(acceptEncoding);

/** True when the response is a text-based body we can usefully compress. */
const isCompressible = (headers: Headers): boolean => {
  // Never double-encode a body an upstream already compressed.
  if (headers.has("content-encoding")) return false;
  return COMPRESSIBLE_CONTENT_TYPE.test(headers.get("content-type") ?? "");
};

const appendVary = (headers: Headers, value: string): void => {
  const values = (headers.get("vary") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!values.some((item) => item.toLowerCase() === value.toLowerCase())) {
    values.push(value);
  }
  headers.set("vary", values.join(", "));
};

const streamFromBytes = (bytes: Uint8Array): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });

/**
 * Gzip-compress a response body in place, honoring the request's
 * `Accept-Encoding`, mutating `headers` to reflect the encoding. Handles both a
 * buffered string body (the header-injection render path) and a streamed
 * `ReadableStream` body (the pass-through / Fresh streaming path), preserving
 * streaming in the latter case.
 *
 * Returns the body to hand to `new Response(...)`: the original body untouched
 * when compression does not apply, or a gzip `ReadableStream` when it does.
 */
export const maybeCompressResponseBody = (
  body: string | ReadableStream<Uint8Array> | null,
  headers: Headers,
  request: Request,
): string | ReadableStream<Uint8Array> | null => {
  if (body === null) return body;
  if (isDisabled()) return body;
  if (!acceptsGzip(request.headers.get("accept-encoding"))) return body;
  if (!isCompressible(headers)) return body;

  let source: ReadableStream<Uint8Array>;
  if (typeof body === "string") {
    const bytes = new TextEncoder().encode(body);
    if (bytes.byteLength < MIN_BYTES_TO_COMPRESS) return body;
    source = streamFromBytes(bytes);
  } else {
    source = body;
  }

  // The cast works around the DOM lib's invariant `WritableStream` chunk type
  // (`BufferSource` vs `Uint8Array<ArrayBuffer>`); `CompressionStream` accepts
  // the `Uint8Array` chunks this stream produces at runtime.
  const compressed = source.pipeThrough(
    new CompressionStream("gzip") as unknown as ReadableWritablePair<
      Uint8Array,
      Uint8Array
    >,
  );

  headers.set("content-encoding", "gzip");
  // Length changes after compression; a stale value would corrupt the response.
  headers.delete("content-length");
  // The response now varies by encoding: the CDN must key gzip vs identity.
  appendVary(headers, "Accept-Encoding");

  return compressed;
};
