/**
 * Conditional GET (ETag / `If-None-Match` → `304 Not Modified`) for cacheable
 * HTML page responses.
 *
 * The engine emits `Cache-Control: ...max-age=..., stale-while-revalidate=...`
 * on cacheable pages but never a validator. So every CDN revalidation — once
 * per `max-age`, per cache variant, per POP — re-fetches the FULL body from the
 * origin, even when the render is byte-for-byte the content the CDN already
 * holds. Emitting a stable ETag and answering `304` collapses those
 * revalidation transfers to headers only, which is the dominant origin egress
 * cost on a high-traffic catalog with a short `max-age`.
 *
 * The ETag hashes the rendered HTML with only the per-request COSMETIC tokens
 * masked out:
 *   - the CSP `nonce` (unique per response by design, security-critical), and
 *   - the `renderSalt` used to disambiguate section instance ids.
 * EVERYTHING semantic — prices, stock, product order, copy — stays in the hash,
 * so any real content change yields a new ETag and a fresh `200`. The ETag
 * never governs freshness (`max-age`/SWR + the loader cache still do); it only
 * avoids re-sending a body the CDN already has. A masked token that slips
 * through simply varies the ETag → no 304 → no harm, just no saving.
 */

const NONCE = /nonce="[^"]*"/g;
// renderSalt appears both as an attribute-ish token and inside `/deco/render`
// URLs; stop at the delimiters that bound a query-param value or attribute.
const RENDER_SALT = /renderSalt=[^"'&\s\\]*/g;

/** Strip per-request cosmetic tokens so equal content hashes equal. */
export const normalizeForEtag = (html: string): string =>
  html.replace(NONCE, 'nonce=""').replace(RENDER_SALT, "renderSalt=");

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/**
 * Weak ETag (`W/"..."`) for a rendered HTML body. Weak because it is computed
 * over a normalized body, so it asserts semantic — not byte — equivalence.
 */
export const weakEtagFor = async (html: string): Promise<string> => {
  const bytes = new TextEncoder().encode(normalizeForEtag(html));
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return `W/"${toHex(digest)}"`;
};

const stripWeakPrefix = (tag: string): string => tag.trim().replace(/^W\//, "");

/**
 * Weak comparison of a request's `If-None-Match` against our ETag, per
 * RFC 9110 §13.1.2 (weak comparison is the one allowed for `If-None-Match`).
 */
export const ifNoneMatchSatisfied = (
  ifNoneMatch: string,
  etag: string,
): boolean => {
  const value = ifNoneMatch.trim();
  if (value === "*") return true;
  const target = stripWeakPrefix(etag);
  return value.split(",").some((candidate) =>
    stripWeakPrefix(candidate) === target
  );
};
