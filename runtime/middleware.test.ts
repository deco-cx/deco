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

Deno.test("matcher Set-Cookie only → public cache-control + hint header", () => {
  const headers = new Headers({ "Content-Type": "text/html" });
  setCookie(headers, { name: matcherCookie, value: "abc@1", path: "/" });
  setCookie(headers, { name: DECO_SEGMENT, value: "%7B%7D", path: "/" });

  applyPageCacheDecision(headers, pageInput);

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
