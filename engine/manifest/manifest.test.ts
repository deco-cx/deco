// deno-lint-ignore-file no-explicit-any
import { assertEquals } from "@std/assert";
import type { AppManifest } from "../../blocks/app.ts";
import { baseState } from "../../runtime/utils.ts";
import { fromJSON } from "../decofile/fetcher.ts";
import { newContext } from "./manifest.ts";

// A minimal website-like app: its `routes` prop is resolved once, at install
// time, and handed to its own blocks through the app state — exactly how the
// website app's `routes` (from `website/loaders/pages.ts`) reaches the router.
const siteManifest = {
  name: "site",
  baseUrl: import.meta.url,
  apps: {
    "site/apps/site.ts": {
      default: (props: { routes: string[] }) => ({
        state: { routes: props.routes },
        manifest: {
          name: "site",
          baseUrl: import.meta.url,
          loaders: {
            "site/loaders/routes.ts": {
              default: (_props: unknown, _req: Request, ctx: any) => ctx.routes,
            },
          },
        },
      }),
    },
  },
} as unknown as AppManifest;

const decofile = (paths: string[]) => ({
  site: {
    __resolveType: "site/apps/site.ts",
    routes: paths,
  },
});

const routesOf = (resolver: any) =>
  resolver.resolve(
    { __resolveType: "site/loaders/routes.ts" },
    {
      request: new Request("http://localhost:8000"),
      context: { state: baseState(), params: {} },
    },
  );

Deno.test("draftResolverFor installs the apps against the draft", async () => {
  const ctx = await newContext(
    siteManifest,
    undefined,
    fromJSON(decofile(["/blog/:slug"])),
    undefined,
    "site",
  );
  const runtime = await ctx.runtime!;
  assertEquals(await routesOf(runtime.resolver), ["/blog/:slug"]);

  const draftDecofile = decofile(["/blog/:slug", "/blog/my-post"]);

  // A bare release swap keeps the app state resolved against the published
  // release: the draft-only page never reaches the routes.
  const swapped = runtime.resolver.with({ release: fromJSON(draftDecofile) });
  assertEquals(await routesOf(swapped), ["/blog/:slug"]);

  const draft = await runtime.draftResolverFor!(draftDecofile);
  assertEquals(await routesOf(draft.resolver), [
    "/blog/:slug",
    "/blog/my-post",
  ]);

  // Memoized per decofile: same install, same release (stable revision).
  const again = await runtime.draftResolverFor!(draftDecofile);
  assertEquals(again.resolver === draft.resolver, true);
  assertEquals(
    await again.release.revision(),
    await draft.release.revision(),
  );

  // The published resolver is untouched.
  assertEquals(await routesOf(runtime.resolver), ["/blog/:slug"]);
});
