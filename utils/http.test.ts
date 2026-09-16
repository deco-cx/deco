import { assertEquals, assertStringIncludes } from "@std/assert";
import { mergeFrameAncestors } from "./http.ts";

const FRAME_ANCESTORS = "frame-ancestors 'self' https://admin.deco.cx";

Deno.test("mergeFrameAncestors: no existing policy returns frame-ancestors alone", () => {
  assertEquals(mergeFrameAncestors(null, FRAME_ANCESTORS), FRAME_ANCESTORS);
  assertEquals(mergeFrameAncestors("", FRAME_ANCESTORS), FRAME_ANCESTORS);
});

Deno.test("mergeFrameAncestors: preserves the app's other directives", () => {
  const existing = "default-src 'self'; script-src 'self' 'nonce-abc'; object-src 'none'";
  const merged = mergeFrameAncestors(existing, FRAME_ANCESTORS);

  assertStringIncludes(merged, "default-src 'self'");
  assertStringIncludes(merged, "script-src 'self' 'nonce-abc'");
  assertStringIncludes(merged, "object-src 'none'");
  assertStringIncludes(merged, FRAME_ANCESTORS);
});

Deno.test("mergeFrameAncestors: replaces an existing frame-ancestors directive", () => {
  const existing = "default-src 'self'; frame-ancestors 'none'";
  const merged = mergeFrameAncestors(existing, FRAME_ANCESTORS);

  // The app's frame-ancestors is dropped in favor of the platform's.
  assertEquals(merged.match(/frame-ancestors/g)?.length, 1);
  assertStringIncludes(merged, FRAME_ANCESTORS);
  assertStringIncludes(merged, "default-src 'self'");
});

Deno.test("mergeFrameAncestors: is case-insensitive on the replaced directive", () => {
  const existing = "default-src 'self'; Frame-Ancestors 'none'";
  const merged = mergeFrameAncestors(existing, FRAME_ANCESTORS);

  assertEquals(merged.match(/frame-ancestors/gi)?.length, 1);
});
