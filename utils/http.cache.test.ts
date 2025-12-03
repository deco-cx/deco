import {
  DEFAULT_CACHE_CONTROL,
  formatCacheControl,
  normalizeCacheControlHeader,
  parseCacheControl,
} from "./http.ts";
import { assertEquals, assertStringIncludes } from "@std/assert";

Deno.test("normalizeCacheControlHeader: true uses DEFAULT_CACHE_CONTROL", () => {
  const header = normalizeCacheControlHeader(true)!;
  const expected = formatCacheControl(DEFAULT_CACHE_CONTROL);
  assertEquals(header, expected);
});

Deno.test("normalizeCacheControlHeader: valid string is preserved (normalized)", () => {
  const input =
    "public, s-maxage=120, max-age=10, stale-while-revalidate=3600, stale-if-error=86400";
  const header = normalizeCacheControlHeader(input)!;
  // Order is not guaranteed; verify presence of key segments
  assertStringIncludes(header, "public");
  assertStringIncludes(header, "s-maxage=120");
  assertStringIncludes(header, "max-age=10");
  // Round-trip parsing should preserve numeric values
  const parsed = parseCacheControl(new Headers({ "cache-control": header }));
  assertEquals(parsed["public"], true);
  assertEquals(parsed["s-maxage"], 120);
  assertEquals(parsed["max-age"], 10);
});

Deno.test("normalizeCacheControlHeader: invalid string falls back to default", () => {
  const header = normalizeCacheControlHeader("totally-invalid-directive=foo")!;
  const expected = formatCacheControl(DEFAULT_CACHE_CONTROL);
  assertEquals(header, expected);
});

Deno.test("normalizeCacheControlHeader: falsy => undefined (disabled)", () => {
  const h1 = normalizeCacheControlHeader(undefined);
  const h2 = normalizeCacheControlHeader(false);
  assertEquals(h1, undefined);
  assertEquals(h2, undefined);
});
