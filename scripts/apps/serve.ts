/// <reference no-default-lib="true"/>
/// <reference lib="dom" />
/// <reference lib="deno.ns" />
/// <reference lib="esnext" />

import { start } from "$fresh/server.ts";
import decoPlugin from "deco/plugins/deco.ts";
import { join, toFileUrl } from "std/path/mod.ts";
import { getDecoConfig } from "./config.ts";
import { AppManifest, SourceMap } from "deco/blocks/app.ts";

const site = Deno.args[0] ?? "playground";
const { apps = [] } = await getDecoConfig(Deno.cwd());

const runningApps: AppManifest = {
  baseUrl: toFileUrl(Deno.cwd()).toString(),
  name: "apps",
  apps: {},
};

const sourceMap: SourceMap = {};

for (const app of apps) {
  const appTs = `${site}/apps/${app.name}.ts`;
  const appFolder = join(Deno.cwd(), app.dir, "mod.ts");
  const fileUrl = toFileUrl(appFolder).toString();
  runningApps.apps![appTs] = await import(
    fileUrl
  );
  sourceMap[appTs] = fileUrl;
}
await start({
  islands: {},
  routes: {},
  baseUrl: toFileUrl(join(Deno.cwd(), "fresh.gen.ts")).toString(),
}, {
  plugins: [
    decoPlugin({
      sourceMap,
      manifest: runningApps,
      site: { namespace: site },
    }),
  ],
});
