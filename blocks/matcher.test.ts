// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { getSetCookies } from "../deps.ts";
import matcherBlock, {
  DECO_MATCHER_PREFIX,
  type MatcherStickySessionModule,
} from "./matcher.ts";

const buildHttpCtx = (respHeaders: Headers) =>
  ({
    resolveChain: [{ type: "resolvable", value: "test-matcher-id" }],
    context: {
      state: {
        response: { headers: respHeaders },
        flags: [] as any[],
        global: {},
        bag: new WeakMap(),
      },
    },
    request: new Request("https://example.com/"),
    resolve: (() => {}) as any,
    revision: undefined,
    resolverId: "test-resolver",
    monitoring: undefined,
  }) as any;

const buildMatchCtx = (request: Request) =>
  ({
    device: "desktop",
    siteId: 1,
    request,
    resolve: (() => {}) as any,
    invoke: (() => {}) as any,
    response: { headers: new Headers() },
    bag: new WeakMap(),
  }) as any;

Deno.test("sticky matcher flips result and sets cookie WITHOUT Vary: cookie", async () => {
  const respHeaders = new Headers();
  const httpCtx = buildHttpCtx(respHeaders);

  const module: MatcherStickySessionModule = {
    default: () => true,
    sticky: "session",
  };

  const result = await resolverFor(module, httpCtx, new Request("https://example.com/"));

  assertEquals(result, true);

  const setCookies = getSetCookies(respHeaders);
  assertEquals(setCookies.length, 1, "expected one Set-Cookie on respHeaders");
  assert(
    setCookies[0].name.startsWith(DECO_MATCHER_PREFIX),
    `expected Set-Cookie name to start with ${DECO_MATCHER_PREFIX}, got ${
      setCookies[0].name
    }`,
  );

  const vary = respHeaders.get("vary") ?? "";
  assert(
    !vary.toLowerCase().includes("cookie"),
    `expected Vary header to NOT contain "cookie", got: ${vary}`,
  );
});

Deno.test("sticky matcher with matching cookie does NOT set a cookie or Vary", async () => {
  const respHeaders = new Headers();
  const httpCtx = buildHttpCtx(respHeaders);

  const module: MatcherStickySessionModule = {
    default: () => true,
    sticky: "session",
  };

  // Build the cookie name the matcher would use, then set it on the request
  // with a value that decodes to `true` so result === isMatchFromCookie.
  const { Murmurhash3 } = await import("../deps.ts");
  const h = new Murmurhash3();
  h.hash("test-matcher-id");
  const cookieName = `${DECO_MATCHER_PREFIX}${h.result()}`;
  // cookieValue.build: btoa(id) + "@" + (result ? 1 : 0)
  const cookieVal = `${btoa("test-matcher-id")}@1`;

  const request = new Request("https://example.com/", {
    headers: { cookie: `${cookieName}=${cookieVal}` },
  });

  const result = await resolverFor(module, httpCtx, request);
  assertEquals(result, true);

  assertEquals(
    getSetCookies(respHeaders).length,
    0,
    "expected no Set-Cookie when cookie value already matches result",
  );
  assertEquals(
    respHeaders.get("vary"),
    null,
    "expected no Vary header when nothing was emitted",
  );
});

Deno.test("non-sticky matcher does not touch respHeaders", async () => {
  const respHeaders = new Headers();
  const httpCtx = buildHttpCtx(respHeaders);

  const module = {
    default: () => true,
    sticky: "none" as const,
  };

  const result = await resolverFor(
    module as any,
    httpCtx,
    new Request("https://example.com/"),
  );
  assertEquals(result, true);

  assertEquals(getSetCookies(respHeaders).length, 0);
  assertEquals(respHeaders.get("vary"), null);
});

// Regression guard: if anyone re-adds Vary: cookie inside the sticky branch,
// this scan will fail. The string check is deliberately broad.
Deno.test("matcher.ts source does not append Vary: cookie", async () => {
  const src = await Deno.readTextFile(new URL("./matcher.ts", import.meta.url));
  assert(
    !/append\(\s*["']vary["']\s*,\s*["']cookie["']\s*\)/i.test(src),
    "blocks/matcher.ts must not append Vary: cookie — that disables CDN caching",
  );
  // Sanity: ensure the cookie-setting code path is still there.
  assertStringIncludes(src, "setCookie(respHeaders");
});

async function resolverFor(
  module: MatcherStickySessionModule | { default: any; sticky: "none" },
  httpCtx: any,
  request: Request,
): Promise<boolean> {
  const adapt = matcherBlock.adapt as any;
  const resolver = adapt(module, "test-matcher-id")({}, httpCtx);
  return await resolver(buildMatchCtx(request));
}
