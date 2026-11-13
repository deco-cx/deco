import {
  assert,
  assertEquals,
  assertNotStrictEquals,
  assertStrictEquals,
} from "@std/assert";
import type { App, AppManifest } from "../blocks/app.ts";
import type { FnContext } from "../blocks/utils.tsx";
import { fromJSON } from "../engine/decofile/fetcher.ts";
import { Deco } from "./mod.ts";

type Route = { path: string; id: string };
type SiteState = { routes?: Route[]; customPath: string };

const manifest: AppManifest = {
  name: "example",
  baseUrl: import.meta.url,
  apps: {
    "example/apps/site.ts": {
      default: (state: SiteState): App => ({
        state,
        manifest,
        resolvables: {
          "./routes/[...catchall].tsx": {
            __resolveType: "example/handlers/router.ts",
          },
        },
      }),
    },
  },
  pages: {
    "example/pages/Page.tsx": { default: () => null },
  },
  loaders: {
    "example/loaders/pages.ts": {
      default: async (_props: unknown, _req: Request, ctx: FnContext) => {
        const pages = await ctx.get<Record<string, { path: string }>>({
          __resolveType: "blockSelector",
          type: "pages",
        });
        return Object.entries(pages).map(([id, { path }]) => ({ id, path }));
      },
    },
  },
  handlers: {
    "example/handlers/router.ts": {
      default: (_props: unknown, state: SiteState) => (req: Request) => {
        const path = new URL(req.url).pathname;
        const route = state.routes?.find((route) => route.path === path);
        return route || path === state.customPath
          ? Response.json({ id: route?.id ?? "custom" })
          : Response.redirect(new URL("/", req.url), 307);
      },
    },
  },
};

Deno.test("draft routing rebuilds installed app state without changing published routes", async () => {
  const published = {
    site: {
      __resolveType: "example/apps/site.ts",
      routes: { __resolveType: "example/loaders/pages.ts" },
      customPath: "/custom",
    },
    home: { __resolveType: "example/pages/Page.tsx", path: "/" },
  };
  const drafts: Record<string, Record<string, unknown>> = {
    added: {
      ...published,
      added: { __resolveType: "example/pages/Page.tsx", path: "/new" },
    },
    renamed: {
      ...published,
      added: { __resolveType: "example/pages/Page.tsx", path: "/renamed" },
    },
    deleted: published,
  };
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen() {} },
    (req) => {
      return Response.json(drafts[new URL(req.url).pathname.slice(1)]);
    },
  );
  const provider = fromJSON(published);
  try {
    const deco = await Deco.init({
      site: "example",
      manifest,
      decofile: provider,
    });
    const request = (path: string, draft?: string, cookie?: string) => {
      const url = new URL(path, "http://localhost");
      if (draft) {
        url.searchParams.set(
          "__draft",
          draft === "off"
            ? "off"
            : `127.0.0.1:${server.addr.port}/${draft}@${draft}`,
        );
      }
      return deco.fetch(
        new Request(url, {
          headers: { host: "localhost", ...(cookie ? { cookie } : {}) },
        }),
      );
    };
    assertEquals((await request("/")).status, 200);
    assertEquals((await request("/new")).status, 307);
    const preview = await request("/new", "added");
    assertEquals(preview.status, 200);
    const cookie = preview.headers.get("set-cookie")?.split(";")[0];
    assert(cookie);
    assertEquals((await request("/new", undefined, cookie)).status, 200);
    assertEquals((await request("/new", "off", cookie)).status, 307);
    assertEquals((await request("/custom", "added")).status, 200);
    assertEquals((await request("/missing", "added")).status, 307);
    assertEquals((await request("/new", "renamed")).status, 307);
    assertEquals((await request("/renamed", "renamed")).status, 200);
    assertEquals((await request("/new", "deleted")).status, 307);
    const results = await Promise.all([
      request("/new", "added"),
      request("/new", "deleted"),
      request("/new"),
    ]);
    assertEquals(results.map((response) => response.status), [200, 307, 307]);
    const runtime = await deco.ctx.runtime!;
    assert(runtime.draftResolverFor);
    const snapshot = structuredClone(drafts.added);
    const [first, second] = await Promise.all([
      runtime.draftResolverFor(snapshot),
      runtime.draftResolverFor(snapshot),
    ]);
    assertStrictEquals(first, second);
    assertStrictEquals(await runtime.draftResolverFor(snapshot), first);
    assertNotStrictEquals(first.resolver, runtime.resolver);
    await provider.set!(drafts.added);
    assertEquals((await request("/new")).status, 200);
    assertEquals((await request("/new", "deleted")).status, 307);
    const nextRuntime = await deco.ctx.runtime!;
    assert(nextRuntime.draftResolverFor);
    assertNotStrictEquals(await nextRuntime.draftResolverFor(snapshot), first);
    await provider.set!(published);
    assertEquals((await request("/new")).status, 307);
    assertEquals((await request("/new", "added")).status, 200);
  } finally {
    await server.shutdown();
  }
});
