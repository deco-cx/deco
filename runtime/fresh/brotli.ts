import { brotliCompressSync, constants } from "node:zlib";

// Deno compresses responses itself, but with the first encoding the request lists. Cloudflare
// asks origins for "gzip, br", so every deco origin sends Cloudflare fast gzip: 35-80% bigger
// than brotli on our HTML/JSON, and that origin->CDN transfer is what we pay egress on.
//
// This encodes brotli instead, after the app (and every site routes/_middleware.ts) has produced
// the response. It has to wrap the server handler: Fresh runs plugin middlewares *inside* the
// site's middleware, and some sites rewrite the HTML body there. Deno leaves responses that
// already carry a content-encoding alone. Opt out with DECO_ORIGIN_BROTLI=false.
const COMPRESSIBLE =
  /^(text\/(html|plain|css|javascript|xml)|application\/(json|javascript|xml|manifest\+json|ld\+json)|image\/svg\+xml)/;
const OPTIONS = { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }; // ~1-3ms per page
const MIN_BYTES = 1024;

const acceptsBrotli = (req: Request) =>
  (req.headers.get("accept-encoding") ?? "").split(",").some((part) => {
    const [name, ...params] = part.trim().toLowerCase().split(";");
    return name === "br" &&
      !params.some((p) => /^\s*q=0(\.0*)?\s*$/.test(p));
  });

export async function brotli(req: Request, res: Response): Promise<Response> {
  if (
    req.method === "HEAD" || !res.body || res.headers.has("content-encoding") ||
    /no-transform/i.test(res.headers.get("cache-control") ?? "") ||
    !COMPRESSIBLE.test(res.headers.get("content-type") ?? "") ||
    !acceptsBrotli(req)
  ) return res;

  const body = new Uint8Array(await res.arrayBuffer());
  const init = { status: res.status, statusText: res.statusText };
  if (body.length < MIN_BYTES) {
    return new Response(body, { ...init, headers: res.headers });
  }

  const headers = new Headers(res.headers);
  headers.set("content-encoding", "br");
  headers.delete("content-length");
  headers.append("vary", "Accept-Encoding");
  const etag = headers.get("etag");
  if (etag && !etag.startsWith("W/")) headers.set("etag", `W/${etag}`);

  return new Response(brotliCompressSync(body, OPTIONS), { ...init, headers });
}

const WRAPPED = Symbol.for("deco.originBrotli");

/** Makes every Deno.serve handler in this process answer with brotli when the client accepts it. */
export function serveBrotli() {
  // deno-lint-ignore no-explicit-any
  const serve = Deno.serve as any;
  if (serve[WRAPPED] || Deno.env.get("DECO_ORIGIN_BROTLI") === "false") return;

  const wrap =
    (handler: Deno.ServeHandler): Deno.ServeHandler => async (req, info) =>
      brotli(req, await handler(req, info));

  // deno-lint-ignore no-explicit-any
  const patched = (...args: any[]) => {
    const i = args.findIndex((arg) => typeof arg === "function");
    if (i >= 0) args[i] = wrap(args[i]);
    else if (typeof args[0]?.handler === "function") {
      args[0] = { ...args[0], handler: wrap(args[0].handler) };
    }
    return serve.apply(Deno, args);
  };
  patched[WRAPPED] = true;
  Deno.serve = patched as typeof Deno.serve;
}
