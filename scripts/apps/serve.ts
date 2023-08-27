/// <reference no-default-lib="true"/>
/// <reference lib="dom" />
/// <reference lib="deno.ns" />
/// <reference lib="esnext" />

import { start } from "$fresh/server.ts";
import decoPlugin from "deco/plugins/deco.ts";
import { join, toFileUrl } from "std/path/mod.ts";

const appFolder = join(Deno.cwd(), Deno.args[0]);
await start({
  islands: {},
  routes: {},
  baseUrl: toFileUrl(join(appFolder, "fresh.gen.ts")).toString(),
}, {
  plugins: [
    decoPlugin({
      sourceMap: {
        [`${Deno.args[0]}/apps/mod.ts`]: toFileUrl(join(appFolder, "mod.ts"))
          .toString(),
      },
      manifest: {
        baseUrl: toFileUrl(join(appFolder, "manifest.gen.ts")).toString(),
        name: Deno.args[0],
        apps: {
          [`${Deno.args[0]}/apps/mod.ts`]: await import(
            join(appFolder, "mod.ts")
          ),
        },
      },
      site: { namespace: Deno.args[1] ?? Deno.args[0] },
    }),
  ],
});
