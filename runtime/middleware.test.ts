import { assert, assertEquals } from "@std/assert";
import { setCookie } from "../utils/cookies.ts";
import { DECO_MATCHER_PREFIX } from "../blocks/matcher.ts";
import { applyPageCacheDecision, DECO_SEGMENT } from "./middleware.ts";

const matcherCookie = `${DECO_MATCHER_PREFIX}1234567890_0.5`;

const pageInput = {
  flags: [],
  isPageCacheAllowed: true,
  shouldCacheFromVary: true,
};

Deno.test("no matcher, no Set-Cookie → public cache-control", () => {
  const headers = new Headers({ "Content-Type": "text/html" });
  applyPageCacheDecision(headers, pageInput);
  const cc = headers.get("Cache-Control") ?? "";
  assert(cc.startsWith("public,"), `expected public Cache-Control, got: ${cc}`);
  assertEquals(headers.get("Deco-Cache-Vary-Cookies"), null);
});

Deno.test("fresh sticky assignment (framework Set-Cookie) → no-store", () => {
  // A framework Set-Cookie means the variant was just drawn this request (e.g.
  // the random matcher's coin flip). Caching it would share that single draw
  // with every cold visitor and break the traffic split, so it must be no-store
  // even though the cookie itself is framework-owned.
  const headers = new Headers({ "Content-Type": "text/html" });
  setCookie(headers, { name: matcherCookie, value: "abc@1", path: "/" });
  setCookie(headers, { name: DECO_SEGMENT, value: "%7B%7D", path: "/" });

  applyPageCacheDecision(headers, pageInput);

  assertEquals(
    headers.get("Cache-Control"),
    "no-store, no-cache, must-revalidate",
  );
  assertEquals(headers.get("Deco-Cache-Vary-Cookies"), null);
});

Deno.test("returning visitor: framework cookie in request, no Set-Cookie → public + vary hint", () => {
  // The variant was read back from the request cookie (no new Set-Cookie), so
  // the response is deterministic and safe to cache — varying by the cookies the
  // visitor already carries.
  const headers = new Headers({ "Content-Type": "text/html" });

  applyPageCacheDecision(headers, {
    ...pageInput,
    requestFrameworkCookies: [matcherCookie, DECO_SEGMENT],
  });

  const cc = headers.get("Cache-Control") ?? "";
  assert(cc.startsWith("public,"), `expected public Cache-Control, got: ${cc}`);

  const hint = headers.get("Deco-Cache-Vary-Cookies") ?? "";
  assert(
    hint.includes(matcherCookie),
    `expected hint to include matcher cookie name, got: ${hint}`,
  );
  assert(
    hint.includes(DECO_SEGMENT),
    `expected hint to include deco_segment, got: ${hint}`,
  );
});

Deno.test("returning visitor with a fresh re-assignment (Set-Cookie) → no-store", () => {
  // Even if the visitor already carries a variant cookie, a NEW framework
  // Set-Cookie means the variant changed/was re-drawn this request → not
  // cacheable, regardless of the request cookies.
  const headers = new Headers({ "Content-Type": "text/html" });
  setCookie(headers, { name: matcherCookie, value: "abc@1", path: "/" });

  applyPageCacheDecision(headers, {
    ...pageInput,
    requestFrameworkCookies: [matcherCookie],
  });

  assertEquals(
    headers.get("Cache-Control"),
    "no-store, no-cache, must-revalidate",
  );
  assertEquals(headers.get("Deco-Cache-Vary-Cookies"), null);
});

Deno.test("foreign Set-Cookie → no-store (safety preserved)", () => {
  const headers = new Headers({ "Content-Type": "text/html" });
  setCookie(headers, { name: matcherCookie, value: "abc@1", path: "/" });
  setCookie(headers, { name: "cart_count", value: "3", path: "/" });

  applyPageCacheDecision(headers, pageInput);

  assertEquals(
    headers.get("Cache-Control"),
    "no-store, no-cache, must-revalidate",
  );
  assertEquals(headers.get("Deco-Cache-Vary-Cookies"), null);
});

Deno.test("vary.shouldCache=false (personalizing loader) → no-store", () => {
  const headers = new Headers({ "Content-Type": "text/html" });
  setCookie(headers, { name: matcherCookie, value: "abc@1", path: "/" });

  applyPageCacheDecision(headers, {
    ...pageInput,
    shouldCacheFromVary: false,
  });

  assertEquals(
    headers.get("Cache-Control"),
    "no-store, no-cache, must-revalidate",
  );
  assertEquals(headers.get("Deco-Cache-Vary-Cookies"), null);
});

Deno.test("flag with cacheable:false → no-store", () => {
  const headers = new Headers({ "Content-Type": "text/html" });

  applyPageCacheDecision(headers, {
    flags: [{ cacheable: false }],
    isPageCacheAllowed: true,
    shouldCacheFromVary: true,
  });

  assertEquals(
    headers.get("Cache-Control"),
    "no-store, no-cache, must-revalidate",
  );
});

Deno.test("isPageCacheAllowed=false → headers untouched", () => {
  const headers = new Headers({ "Content-Type": "text/html" });
  setCookie(headers, { name: matcherCookie, value: "abc@1", path: "/" });

  applyPageCacheDecision(headers, {
    ...pageInput,
    isPageCacheAllowed: false,
  });

  assertEquals(headers.get("Cache-Control"), null);
  assertEquals(headers.get("Deco-Cache-Vary-Cookies"), null);
});

Deno.test("respects pre-existing Cache-Control header", () => {
  const headers = new Headers({
    "Content-Type": "text/html",
    "Cache-Control": "public, max-age=600",
  });

  applyPageCacheDecision(headers, pageInput);

  assertEquals(headers.get("Cache-Control"), "public, max-age=600");
});

Deno.test(
  "cacheDisqualified overrides a pre-existing Cache-Control header",
  () => {
    const headers = new Headers({
      "Content-Type": "text/html",
      "Cache-Control": "public, max-age=600",
    });
    setCookie(headers, { name: "session_id", value: "xyz", path: "/" });

    applyPageCacheDecision(headers, pageInput);

    assertEquals(
      headers.get("Cache-Control"),
      "no-store, no-cache, must-revalidate",
    );
  },
);
