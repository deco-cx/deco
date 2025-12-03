import { assert, assertEquals } from "@std/assert";
import matcherBlock, { type MatcherModule } from "./matcher.ts";
import {
  DECO_PAGE_CACHE_ALLOW_HEADER,
  DECO_PAGE_CACHE_CONTROL_HEADER,
} from "../utils/http.ts";

// Minimal HttpContext stub with just what matcher.adapt needs
const makeHttpCtx = (resolverPath: string, headers: Headers) =>
  ({
    resolveChain: [{ type: "resolvable", value: resolverPath }],
    context: {
      state: {
        response: { headers },
        flags: [] as Array<
          { name: string; value: boolean; isSegment: boolean }
        >,
      },
    },
    request: new Request("http://local/"),
  }) as any;

// A matcher module that always returns true (so we can see when page caching forces false)
const TRUE_MATCHER: MatcherModule = {
  default: () => true,
};

Deno.test("page cache ON: allows device matcher; blocks others by default", async () => {
  const headers = new Headers();
  headers.set(
    DECO_PAGE_CACHE_CONTROL_HEADER,
    "public, s-maxage=60, max-age=10",
  );

  // Allowed: device
  {
    const ctx = makeHttpCtx("/site/matchers/device.tsx", headers);
    const adapted = matcherBlock.adapt!(TRUE_MATCHER, "site/matchers/device.tsx");
    const fn = await (adapted as any)({}, ctx);
    const result = fn({ device: {} as any, siteId: 1, request: ctx.request });
    assert(result, "device matcher should be allowed when page-cache is ON");
    // flag recorded and true
    const flag = ctx.context.state.flags[0];
    assertEquals(flag?.name, "/site/matchers/device.tsx");
    assertEquals(flag?.value, true);
  }

  // Blocked: any non device/time matcher
  {
    const ctx = makeHttpCtx("/site/matchers/url.tsx", headers);
    const adapted = matcherBlock.adapt!(TRUE_MATCHER, "site/matchers/url.tsx");
    const fn = await (adapted as any)({}, ctx);
    const result = fn({ device: {} as any, siteId: 1, request: ctx.request });
    assertEquals(
      result,
      false,
      "non device/time matchers must be disabled when page-cache is ON",
    );
    const flag = ctx.context.state.flags[0];
    assertEquals(flag?.name, "/site/matchers/url.tsx");
    assertEquals(flag?.value, false);
  }
});

Deno.test("page cache ON: allows time matchers (date/cron)", async () => {
  const headers = new Headers();
  headers.set(
    DECO_PAGE_CACHE_CONTROL_HEADER,
    "public, s-maxage=60, max-age=10",
  );

  const dateCtx = makeHttpCtx("/site/matchers/date.ts", headers);
  const dateAdapted = matcherBlock.adapt!(TRUE_MATCHER, "site/matchers/date.ts");
  const dateFn = await (dateAdapted as any)({}, dateCtx);
  assert(
    dateFn({ device: {} as any, siteId: 1, request: dateCtx.request }),
    "date matcher should be allowed",
  );
  assertEquals(dateCtx.context.state.flags[0]?.value, true);

  const cronCtx = makeHttpCtx("/site/matchers/cron.ts", headers);
  const cronAdapted = matcherBlock.adapt!(TRUE_MATCHER, "site/matchers/cron.ts");
  const cronFn = await (cronAdapted as any)({}, cronCtx);
  assert(
    cronFn({ device: {} as any, siteId: 1, request: cronCtx.request }),
    "cron matcher should be allowed",
  );
  assertEquals(cronCtx.context.state.flags[0]?.value, true);
});

Deno.test("page cache ON: honor allow-list header", async () => {
  const headers = new Headers();
  headers.set(
    DECO_PAGE_CACHE_CONTROL_HEADER,
    "public, s-maxage=60, max-age=10",
  );
  headers.set(DECO_PAGE_CACHE_ALLOW_HEADER, "device"); // time not allowed now

  const ctx = makeHttpCtx("/site/matchers/date.ts", headers);
  const adapted = matcherBlock.adapt!(TRUE_MATCHER, "site/matchers/date.ts");
  const fn = await (adapted as any)({}, ctx);
  const result = fn({ device: {} as any, siteId: 1, request: ctx.request });
  assertEquals(
    result,
    false,
    "time matcher should be disabled when 'device' is the only allowed group",
  );
});

Deno.test("page cache OFF: evaluate matcher normally", async () => {
  const headers = new Headers(); // no page cache header
  const ctx = makeHttpCtx("/site/matchers/url.tsx", headers);
  const adapted = matcherBlock.adapt!(TRUE_MATCHER, "site/matchers/url.tsx");
  const fn = await (adapted as any)({}, ctx);
  const result = fn({ device: {} as any, siteId: 1, request: ctx.request });
  assert(
    result,
    "when page-cache is OFF, non device/time matchers are evaluated normally",
  );
});

// Sticky-session: ensure that when page cache is ON and a matcher is not allowed,
// we do not set sticky cookies.
Deno.test("page cache ON: sticky-session matcher does not set cookie when disabled", async () => {
  const headers = new Headers();
  headers.set(
    DECO_PAGE_CACHE_CONTROL_HEADER,
    "public, s-maxage=60, max-age=10",
  );
  const STICKY_TRUE_MATCHER: MatcherModule = {
    sticky: "session",
    default: () => true,
    sessionKey: () => "k",
  } as any;
  const ctx = makeHttpCtx("/site/matchers/url.tsx", headers);
  const adapted = matcherBlock.adapt!(STICKY_TRUE_MATCHER, "site/matchers/url.tsx");
  const fn = await (adapted as any)({}, ctx);
  const result = fn({ device: {} as any, siteId: 1, request: ctx.request });
  assertEquals(result, false);
  // should not set cookie when disabled by page caching
  assertEquals(headers.has("set-cookie"), false);
});
