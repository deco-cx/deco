import { assert, assertEquals, assertNotEquals } from "@std/assert";
import {
  ifNoneMatchSatisfied,
  normalizeForEtag,
  weakEtagFor,
} from "./conditionalGet.ts";

// Only the tokens the engine masks (CSP nonce, renderSalt query param) vary
// here; everything else is semantic content that must land in the hash.
const page = (opts: { nonce: string; salt: string; price: number }) =>
  `<!DOCTYPE html><html><head>` +
  `<script nonce="${opts.nonce}">a=1</script>` +
  `</head><body>` +
  `<a href="/deco/render?props=%7B%7D&renderSalt=${opts.salt}&__cb=abc">x</a>` +
  `<span data-price="${opts.price}">R$ ${opts.price}</span>` +
  `</body></html>`;

Deno.test("normalizeForEtag masks nonce and renderSalt", () => {
  const out = normalizeForEtag(
    '<script nonce="abc123">z</script>?renderSalt=deadbeef-01&__cb=1',
  );
  assertEquals(
    out,
    '<script nonce="">z</script>?renderSalt=&__cb=1',
  );
});

Deno.test("ETag is stable across differing nonce and renderSalt", async () => {
  const a = await weakEtagFor(page({ nonce: "n1", salt: "s1", price: 449 }));
  const b = await weakEtagFor(page({ nonce: "n2", salt: "s2", price: 449 }));
  assertEquals(a, b);
  assert(a.startsWith('W/"'));
});

Deno.test("ETag changes when the price changes (never masked)", async () => {
  const a = await weakEtagFor(page({ nonce: "n1", salt: "s1", price: 449 }));
  const b = await weakEtagFor(page({ nonce: "n1", salt: "s1", price: 359 }));
  assertNotEquals(a, b);
});

Deno.test("If-None-Match weak comparison matches our weak ETag", async () => {
  const etag = await weakEtagFor(page({ nonce: "n", salt: "s", price: 449 }));
  assert(ifNoneMatchSatisfied(etag, etag));
  // strong form of the same opaque value still matches (weak comparison)
  assert(ifNoneMatchSatisfied(etag.replace(/^W\//, ""), etag));
  // present in a list
  assert(ifNoneMatchSatisfied(`W/"other", ${etag}`, etag));
  // wildcard
  assert(ifNoneMatchSatisfied("*", etag));
});

Deno.test("If-None-Match does not match a different ETag", async () => {
  const etag = await weakEtagFor(page({ nonce: "n", salt: "s", price: 449 }));
  const other = await weakEtagFor(page({ nonce: "n", salt: "s", price: 99 }));
  assert(!ifNoneMatchSatisfied(other, etag));
  assert(!ifNoneMatchSatisfied('W/"nope"', etag));
});
