import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { setCookie } from "../utils/cookies.ts";
import { DECO_MATCHER_PREFIX } from "../blocks/matcher.ts";
import { applyPageCacheDecision, DECO_SEGMENT } from "./middleware.ts";
import {
  buildClientCookieScript,
  injectScriptIntoHtml,
} from "./clientCookies.ts";

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

// ---------- buildClientCookieScript ----------

Deno.test("buildClientCookieScript: matcher cookie only → one document.cookie setter", () => {
  const headers = new Headers();
  setCookie(headers, { name: matcherCookie, value: "abc@1", path: "/" });

  const script = buildClientCookieScript(headers);
  assert(script !== null, "expected a script");
  assertStringIncludes(script, `<script>document.cookie=`);
  assertStringIncludes(script, matcherCookie);
  assertStringIncludes(script, "abc@1");
  assertStringIncludes(script, "path=/");
  assertStringIncludes(script, "max-age=2592000");
  assertStringIncludes(script, "samesite=Lax");
  // Exactly one document.cookie= setter
  assertEquals(script.match(/document\.cookie=/g)?.length, 1);
});

Deno.test("buildClientCookieScript: matcher + segment → two setters", () => {
  const headers = new Headers();
  setCookie(headers, { name: matcherCookie, value: "abc@1", path: "/" });
  setCookie(
    headers,
    { name: DECO_SEGMENT, value: '{"active":["foo"]}', path: "/" },
    { encode: true },
  );

  const script = buildClientCookieScript(headers);
  assert(script !== null, "expected a script");
  assertEquals(script.match(/document\.cookie=/g)?.length, 2);
  assertStringIncludes(script, matcherCookie);
  assertStringIncludes(script, DECO_SEGMENT);
});

Deno.test("buildClientCookieScript: only foreign Set-Cookie → null", () => {
  const headers = new Headers();
  setCookie(headers, { name: "cart_count", value: "3", path: "/" });

  assertEquals(buildClientCookieScript(headers), null);
});

Deno.test("buildClientCookieScript: no Set-Cookie → null", () => {
  assertEquals(buildClientCookieScript(new Headers()), null);
});

Deno.test("buildClientCookieScript: escapes < and > to defend against </script> breakout", () => {
  // Defense-in-depth. Today the framework's own emissions can never put `<`
  // in the cookie value (deco_segment is URL-encoded + base64-encoded by
  // setCookie({encode:true}); deco_matcher_* is base64 + "@" + digit). But
  // the `sessionKey()` callback is operator-defined and lands in the cookie
  // NAME unprocessed. If an operator returned `</script>` from sessionKey
  // (or any future framework cookie carries `<`), our escape must defend.
  const headers = new Headers();
  headers.append(
    "Set-Cookie",
    `${DECO_MATCHER_PREFIX}999_</script><x>=v; Path=/`,
  );

  const script = buildClientCookieScript(headers);
  assert(script !== null);
  // The script tag must close exactly once at the end.
  assertEquals(script.match(/<\/script>/g)?.length, 1);
  assert(
    !script.slice(0, -"</script>".length).includes("</script>"),
    "no nested </script> closer",
  );
  // The injected `<` bytes are escaped as <.
  assertStringIncludes(script, "\\u003c");
});

Deno.test("buildClientCookieScript: segment URL-encoded base64 value preserved verbatim", () => {
  // Segment is set with { encode: true } → btoa(encodeURIComponent(value)).
  // We MUST inject the wire-form bytes so that on the next request the browser
  // sends back the same string the server reads with getCookies().
  const headers = new Headers();
  const seg = '{"active":["abc","def"]}';
  setCookie(headers, { name: DECO_SEGMENT, value: seg, path: "/" }, {
    encode: true,
  });

  const wireValue = headers
    .getSetCookie()
    .find((c) => c.startsWith(`${DECO_SEGMENT}=`))!
    .split(";")[0]
    .split("=")[1];

  const script = buildClientCookieScript(headers);
  assert(script !== null);
  assertStringIncludes(script, `${DECO_SEGMENT}=${wireValue}`);
});

// ---------- injectScriptIntoHtml ----------

const SCRIPT = "<script>X</script>";

Deno.test("injectScriptIntoHtml: injects before </head>", () => {
  const html = "<html><head><title>t</title></head><body>b</body></html>";
  const out = injectScriptIntoHtml(html, SCRIPT);
  assertStringIncludes(out, `<title>t</title>${SCRIPT}</head>`);
});

Deno.test("injectScriptIntoHtml: falls back to </body> when no </head>", () => {
  const html = "<html><body>b</body></html>";
  const out = injectScriptIntoHtml(html, SCRIPT);
  assertStringIncludes(out, `b${SCRIPT}</body>`);
});

Deno.test("injectScriptIntoHtml: appends when no </head> or </body>", () => {
  const html = "loose text";
  assertEquals(injectScriptIntoHtml(html, SCRIPT), `loose text${SCRIPT}`);
});

Deno.test("injectScriptIntoHtml: prefers first </head> (handles embedded HTML)", () => {
  // SVG foreignObject etc. could contain a nested </head>. We must not target
  // the LAST one — the document's real </head> is always the FIRST one.
  const html =
    "<html><head><meta /></head><body><svg><foreignObject><html><head></head></html></foreignObject></svg></body></html>";
  const out = injectScriptIntoHtml(html, SCRIPT);
  // Script lands in the document head, not the foreignObject head.
  const firstHeadClose = out.indexOf("</head>");
  assertEquals(
    out.slice(firstHeadClose - SCRIPT.length, firstHeadClose),
    SCRIPT,
  );
});
