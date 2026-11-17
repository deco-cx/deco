// deno-lint-ignore-file no-explicit-any
/**
 * Content-Encoding as on Deno.
 *
 * Deno's `fetch` decodes gzip/br/deflate bodies and drops `Content-Encoding`
 * and `Content-Length`; `Deno.serve` sends a body that carries
 * `Content-Encoding` as is. workerd does neither by default: its `fetch` keeps
 * both headers on the decoded body, and a returned response that carries
 * `Content-Encoding` is encoded again (`encodeBody: "automatic"`).
 *
 * So a site that compresses its own HTML (e.g. brotli in `_middleware.ts`)
 * reached visitors compressed twice. Doing only the second half (send as is)
 * would break the opposite case: a proxied `fetch` response forwarded with
 * its headers (the `website` proxy handler) would go out decoded but labelled
 * gzip. Both halves together give Deno's behaviour.
 */

/**
 * Codings workerd's `fetch` decodes when the caller doesn't opt out. Exact,
 * case-sensitive values: workerd leaves `x-gzip`, `deflate`, `GZIP`... encoded
 * (checked on wrangler 4 / compatibility date 2026-11-01).
 */
const DECODED = new Set(["gzip", "br"]);

/**
 * A `fetch` response as Deno returns it: when workerd decoded the body, drop
 * the headers that described the encoded one.
 */
export function asDenoFetchResponse(res: Response): Response {
  const coding = res.headers.get("content-encoding");
  if (!coding || !DECODED.has(coding) || (res as any).webSocket) return res;
  const headers = new Headers(res.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  return withUrl(
    new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    }),
    res.url,
    res.redirected,
  );
}

/**
 * `url` / `redirected` aren't constructor options, and code reads them (e.g.
 * to follow where a redirect landed). Kept on clones too.
 */
const withUrl = (res: Response, url: string, redirected: boolean) => {
  const clone = res.clone.bind(res);
  return Object.defineProperties(res, {
    url: { value: url, enumerable: true },
    redirected: { value: redirected, enumerable: true },
    clone: { value: () => withUrl(clone(), url, redirected) },
  });
};

const WRAPPED = Symbol.for("deco.workerd.fetch");

/** Makes `globalThis.fetch` return responses as Deno's does. Idempotent. */
export function installDenoFetch(): void {
  const g = globalThis as any;
  if (typeof g.fetch !== "function" || g.fetch[WRAPPED]) return;
  const original = g.fetch.bind(globalThis);
  const fetch = async (input: unknown, init?: Record<string, unknown>) => {
    // `encodeResponseBody: "manual"` (workerd): the body is not decoded. Read
    // before the call, as workerd does. Only `init` counts: workerd ignores it
    // on a `Request` (checked: such a body still comes back decoded).
    const manual = init?.encodeResponseBody === "manual";
    const res: Response = await original(input, init);
    return manual ? res : asDenoFetchResponse(res);
  };
  fetch[WRAPPED] = true;
  g.fetch = fetch;
}

/**
 * The response to send to the visitor: a body that carries `Content-Encoding`
 * is already encoded, so workerd must send it as is (as `Deno.serve` does).
 */
export function sendAsIs(res: Response): Response {
  if (
    !res.body || !res.headers.has("content-encoding") ||
    (res as any).webSocket
  ) {
    return res;
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
    // workerd-only option; ignored elsewhere.
    encodeBody: "manual",
  } as ResponseInit);
}
