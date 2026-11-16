import { assert, assertEquals, assertRejects } from "@std/assert";
import {
  bypassReason,
  cacheKey,
  cacheWindows,
  deviceClass,
  type PageCacheOptions,
  servePage,
} from "./pageCache.ts";

const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const PAGE_CC =
  "public, max-age=90, stale-while-revalidate=3600, stale-if-error=86400";

/** A Cache API stand-in keyed by URL. */
class MemoryCache {
  entries = new Map<string, Response>();
  puts = 0;
  matches = 0;
  match(req: Request) {
    this.matches++;
    const hit = this.entries.get(req.url);
    return Promise.resolve(hit?.clone());
  }
  async put(req: Request, res: Response) {
    this.puts++;
    // Read the body as the Cache API does.
    const body = await res.arrayBuffer();
    this.entries.set(req.url, new Response(body, res));
  }
}

function setup(over: Partial<PageCacheOptions> = {}) {
  const cache = new MemoryCache();
  let clock = 1_000_000;
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => void pending.push(p) };
  const options: PageCacheOptions = {
    version: "build1",
    cache: cache as unknown as Cache,
    now: () => clock,
    ...over,
  };
  let renders = 0;
  const page = (
    body = "page",
    headers: Record<string, string> = { "cache-control": PAGE_CC },
    status = 200,
  ) =>
  () => {
    renders++;
    return Promise.resolve(
      new Response(body, {
        status,
        headers: { "content-type": "text/html", ...headers },
      }),
    );
  };
  const req = (path = "/", init: RequestInit = {}) =>
    new Request(`https://www.example.com${path}`, {
      ...init,
      headers: { "user-agent": DESKTOP_UA, ...(init.headers ?? {}) },
    });
  return {
    cache,
    ctx,
    options,
    page,
    req,
    renders: () => renders,
    settle: () => Promise.all(pending.splice(0)),
    advance: (seconds: number) => (clock += seconds * 1000),
  };
}

Deno.test("cacheWindows reads s-maxage over max-age, and the stale windows", () => {
  assertEquals(cacheWindows(PAGE_CC), { fresh: 90, swr: 3600, sie: 86400 });
  assertEquals(cacheWindows("public, max-age=60, s-maxage=300"), {
    fresh: 300,
    swr: 0,
    sie: 0,
  });
});

Deno.test("cacheWindows refuses what a shared cache must not keep", () => {
  for (
    const cc of [
      null,
      "",
      "private, max-age=60",
      "no-store, no-cache, must-revalidate",
      "public, no-cache, max-age=60",
      "public, max-age=0",
      "public",
    ]
  ) {
    assertEquals(cacheWindows(cc), null, String(cc));
  }
});

Deno.test("deviceClass: Cloudflare's hint, else the user agent", () => {
  const r = (headers: Record<string, string>) =>
    new Request("https://x/", { headers });
  assertEquals(deviceClass(r({ "user-agent": IPHONE_UA })), "mobile");
  assertEquals(deviceClass(r({ "user-agent": DESKTOP_UA })), "desktop");
  assertEquals(
    deviceClass(r({ "user-agent": IPHONE_UA, "cf-device-type": "tablet" })),
    "tablet",
  );
});

Deno.test("cacheKey drops tracking params and splits by version, device and variant cookies", () => {
  const key = (url: string, headers: Record<string, string> = {}) =>
    cacheKey(
      new Request(url, { headers: { "user-agent": DESKTOP_UA, ...headers } }),
      { version: "b1", keyCookies: ["vtex_segment"] },
    ).url;
  assertEquals(
    key("https://s.com/shoes?utm_source=x&page=2&gclid=y#top"),
    key("https://s.com/shoes?page=2"),
  );
  assert(new URL(key("https://s.com/shoes")).pathname.includes("/b1/"));
  assert(
    key("https://s.com/shoes") !==
      key("https://s.com/shoes", { "user-agent": IPHONE_UA }),
  );
  // deco's own variant cookies and the configured ones split; others don't.
  const base = key("https://s.com/shoes");
  assertEquals(key("https://s.com/shoes", { cookie: "_ga=1; other=2" }), base);
  assert(
    key("https://s.com/shoes", { cookie: "deco_segment=%7B%7D" }) !== base,
  );
  assert(
    key("https://s.com/shoes", { cookie: "deco_matcher_123_0.5=a@1" }) !== base,
  );
  assert(key("https://s.com/shoes", { cookie: "vtex_segment=abc" }) !== base);
  // Cookie order doesn't matter.
  assertEquals(
    key("https://s.com/shoes", { cookie: "deco_segment=a; vtex_segment=b" }),
    key("https://s.com/shoes", { cookie: "vtex_segment=b; deco_segment=a" }),
  );
});

Deno.test("bypassReason: drafts, debug, auth, deco endpoints and bypass cookies", () => {
  const r = (path: string, init: RequestInit = {}) =>
    new Request(`https://s.com${path}`, init);
  assertEquals(bypassReason(r("/shoes")), null);
  assertEquals(bypassReason(r("/deco/render?props=x")), null);
  assertEquals(bypassReason(r("/shoes", { method: "POST" })), "method");
  assertEquals(bypassReason(r("/shoes", { method: "HEAD" })), "method");
  assertEquals(
    bypassReason(r("/shoes", { headers: { authorization: "Bearer x" } })),
    "authorization",
  );
  assertEquals(bypassReason(r("/live/invoke/x")), "deco-endpoint");
  assertEquals(bypassReason(r("/deco/meta")), "deco-endpoint");
  assertEquals(bypassReason(r("/.decofile")), "deco-endpoint");
  assertEquals(bypassReason(r("/shoes?__draft=abc")), "draft");
  assertEquals(
    bypassReason(r("/shoes", { headers: { cookie: "__deco_draft=abc" } })),
    "draft",
  );
  assertEquals(bypassReason(r("/shoes?__d")), "debug");
  assertEquals(
    bypassReason(
      r("/shoes", { headers: { cookie: "VtexIdclientAutCookie_x=1" } }),
      ["VtexIdclientAutCookie"],
    ),
    "cookie",
  );
});

Deno.test("MISS stores a public page, then HIT serves it with the page's own Cache-Control", async () => {
  const t = setup();
  const first = await servePage(t.req(), t.ctx, t.page("v1"), t.options);
  assertEquals(first.headers.get("x-cache"), "MISS");
  assertEquals(await first.text(), "v1");
  await t.settle();
  assertEquals(t.cache.puts, 1);

  t.advance(30);
  const second = await servePage(t.req(), t.ctx, t.page("v2"), t.options);
  assertEquals(second.headers.get("x-cache"), "HIT");
  assertEquals(await second.text(), "v1");
  assertEquals(second.headers.get("cache-control"), PAGE_CC);
  assertEquals(second.headers.get("x-cache-age"), "30");
  assertEquals(second.headers.get("x-deco-stored-at"), null);
  assertEquals(second.headers.get("x-deco-origin-cache-control"), null);
  assertEquals(t.renders(), 1);
});

Deno.test("STALE-HIT serves the copy and revalidates in waitUntil", async () => {
  const t = setup();
  await servePage(t.req(), t.ctx, t.page("v1"), t.options);
  await t.settle();
  t.advance(120); // past max-age=90, inside stale-while-revalidate
  const stale = await servePage(t.req(), t.ctx, t.page("v2"), t.options);
  assertEquals(stale.headers.get("x-cache"), "STALE-HIT");
  assertEquals(await stale.text(), "v1");
  await t.settle();
  t.advance(1);
  const fresh = await servePage(t.req(), t.ctx, t.page("v3"), t.options);
  assertEquals(fresh.headers.get("x-cache"), "HIT");
  assertEquals(await fresh.text(), "v2");
});

Deno.test("STALE-ERROR serves the copy when the render throws or answers 5xx", async () => {
  const t = setup();
  await servePage(t.req(), t.ctx, t.page("v1"), t.options);
  await t.settle();
  t.advance(4000); // past fresh + swr, inside stale-if-error
  const failing = await servePage(
    t.req(),
    t.ctx,
    () => Promise.reject(new Error("boom")),
    t.options,
  );
  assertEquals(failing.headers.get("x-cache"), "STALE-ERROR");
  assertEquals(await failing.text(), "v1");

  const fiveHundred = await servePage(
    t.req(),
    t.ctx,
    t.page("err", { "cache-control": "no-store" }, 503),
    t.options,
  );
  assertEquals(fiveHundred.headers.get("x-cache"), "STALE-ERROR");
  assertEquals(fiveHundred.headers.get("x-cache-reason"), "status:503");
});

Deno.test("a render error without a copy still throws", async () => {
  const t = setup();
  await assertRejects(() =>
    servePage(
      t.req(),
      t.ctx,
      () => Promise.reject(new Error("boom")),
      t.options,
    )
  );
});

Deno.test("never stores what deco didn't mark public, a Set-Cookie, a Vary, or a non-200", async () => {
  const cases: [Record<string, string>, number, string][] = [
    [
      { "cache-control": "no-store, no-cache, must-revalidate" },
      200,
      "cache-control",
    ],
    [{}, 200, "cache-control"],
    [
      { "cache-control": PAGE_CC, "set-cookie": "sid=1; Path=/" },
      200,
      "set-cookie",
    ],
    [{ "cache-control": PAGE_CC, vary: "Cookie" }, 200, "vary"],
    [{ "cache-control": PAGE_CC }, 404, "status:404"],
  ];
  for (const [headers, status, reason] of cases) {
    const t = setup();
    const res = await servePage(
      t.req(),
      t.ctx,
      t.page("x", headers, status),
      t.options,
    );
    await t.settle();
    assertEquals(res.headers.get("x-cache"), "BYPASS");
    assertEquals(res.headers.get("x-cache-reason"), reason);
    assertEquals(t.cache.puts, 0, reason);
  }
});

Deno.test("Vary: Accept-Encoding is fine", async () => {
  const t = setup();
  const res = await servePage(
    t.req(),
    t.ctx,
    t.page("x", { "cache-control": PAGE_CC, vary: "Accept-Encoding" }),
    t.options,
  );
  assertEquals(res.headers.get("x-cache"), "MISS");
  await t.settle();
  assertEquals(t.cache.puts, 1);
});

Deno.test("a bypassed request neither reads nor writes the cache", async () => {
  const t = setup({ bypassCookies: ["VtexIdclientAutCookie"] });
  await servePage(t.req(), t.ctx, t.page("anon"), t.options);
  await t.settle();
  const signedIn = await servePage(
    t.req("/", { headers: { cookie: "VtexIdclientAutCookie_store=tok" } }),
    t.ctx,
    t.page("signed-in"),
    t.options,
  );
  await t.settle();
  assertEquals(signedIn.headers.get("x-cache"), "BYPASS");
  assertEquals(await signedIn.text(), "signed-in");
  assertEquals(t.cache.puts, 1);
  // Only the first (anonymous) request read the cache.
  assertEquals(t.cache.matches, 1);
  const draft = await servePage(
    t.req("/?__draft=p1"),
    t.ctx,
    t.page("draft"),
    t.options,
  );
  assertEquals(await draft.text(), "draft");
  assertEquals(t.cache.matches, 1);
});

Deno.test("a new build never serves the previous build's pages", async () => {
  const t = setup();
  await servePage(t.req(), t.ctx, t.page("old"), t.options);
  await t.settle();
  const next = await servePage(
    t.req(),
    t.ctx,
    t.page("new"),
    { ...t.options, version: "build2" },
  );
  assertEquals(next.headers.get("x-cache"), "MISS");
  assertEquals(await next.text(), "new");
});

Deno.test("no Cache API: renders and says so", async () => {
  const t = setup({ cache: null });
  const res = await servePage(t.req(), t.ctx, t.page("x"), t.options);
  assertEquals(res.headers.get("x-cache"), "BYPASS");
  assertEquals(res.headers.get("x-cache-reason"), "no-cache-api");
});

Deno.test("cacheWindows: must-revalidate / proxy-revalidate store but never serve stale", () => {
  assertEquals(
    cacheWindows(
      "public, max-age=60, must-revalidate, stale-while-revalidate=600",
    ),
    {
      fresh: 60,
      swr: 0,
      sie: 0,
    },
  );
  assertEquals(
    cacheWindows("public, s-maxage=60, proxy-revalidate, stale-if-error=600"),
    {
      fresh: 60,
      swr: 0,
      sie: 0,
    },
  );
});

Deno.test("cacheWindows: delta-seconds are digits only, and bounded", () => {
  assertEquals(cacheWindows("public, max-age=60abc"), null);
  assertEquals(cacheWindows("public, max-age=1e3"), null);
  assertEquals(cacheWindows("public, max-age=99999999999999999999"), null);
  assertEquals(
    cacheWindows("public, max-age=60, stale-while-revalidate=1e3")?.swr,
    0,
  );
});

Deno.test("cacheKey: a page's own query can't collide with the key's metadata", () => {
  const key = (url: string) =>
    cacheKey(new Request(url, { headers: { "user-agent": DESKTOP_UA } }), {
      version: "b1",
    }).url;
  const plain = key("https://s.com/p");
  for (const q of ["__v=b1", "__dev=desktop", "__ck=x", "__v=evil"]) {
    assert(key(`https://s.com/p?${q}`) !== plain, q);
  }
  // A page path that looks like the prefix still maps to its own entry.
  assert(key("https://s.com/__deco_page_cache/b1/desktop//p") !== plain);
});

Deno.test("no build version: never cached", async () => {
  const t = setup({ version: "" });
  const res = await servePage(t.req(), t.ctx, t.page("x"), t.options);
  await t.settle();
  assertEquals(res.headers.get("x-cache"), "BYPASS");
  assertEquals(res.headers.get("x-cache-reason"), "no-version");
  assertEquals(t.cache.matches + t.cache.puts, 0);
});

Deno.test("an encoded body is never stored", async () => {
  const t = setup();
  const res = await servePage(
    t.req(),
    t.ctx,
    t.page("x", { "cache-control": PAGE_CC, "content-encoding": "gzip" }),
    t.options,
  );
  await t.settle();
  assertEquals(res.headers.get("x-cache-reason"), "content-encoding");
  assertEquals(t.cache.puts, 0);
});

Deno.test("stale-while-revalidate renders once per key while a revalidation runs", async () => {
  const t = setup();
  await servePage(t.req(), t.ctx, t.page("v1"), t.options);
  await t.settle();
  t.advance(120);
  let renders = 0;
  let release!: () => void;
  const slow = () => {
    renders++;
    return new Promise<Response>((r) => {
      release = () =>
        r(new Response("v2", { headers: { "cache-control": PAGE_CC } }));
    });
  };
  const a = await servePage(t.req(), t.ctx, slow, t.options);
  const b = await servePage(t.req(), t.ctx, slow, t.options);
  assertEquals([a.headers.get("x-cache"), b.headers.get("x-cache")], [
    "STALE-HIT",
    "STALE-HIT",
  ]);
  assertEquals(renders, 1);
  release();
  await t.settle();
  await t.settle();
  t.advance(1);
  const c = await servePage(t.req(), t.ctx, t.page("v3"), t.options);
  assertEquals(await c.text(), "v2");
});
