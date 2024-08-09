/// <reference no-default-lib="true"/>
/// <reference lib="dom" />
/// <reference lib="deno.ns" />
/// <reference lib="esnext" />

import { start } from "$fresh/server.ts";
import { join, toFileUrl } from "@std/path";
import type { AppManifest, ImportMap } from "../../blocks/app.ts";
import decoPlugin from "../../plugins/deco.ts";
import { getDecoConfig } from "./config.ts";

const site = Deno.args[0] ?? "playground";
const { apps = [] } = await getDecoConfig(Deno.cwd());

const runningApps: AppManifest = {
  baseUrl: toFileUrl(Deno.cwd()).toString(),
  name: "apps",
  apps: {},
};

const importMap: ImportMap = { imports: {} };

for (const app of apps) {
  const appTs = `${site}/apps/${app.name}.ts`;
  const appFolder = join(Deno.cwd(), app.dir, "mod.ts");
  const fileUrl = toFileUrl(appFolder).toString();
  runningApps.apps![appTs] = await import(
    fileUrl
  );
  importMap.imports[appTs] = fileUrl;
}
await start({
  islands: {},
  routes: {},
  baseUrl: toFileUrl(join(Deno.cwd(), "fresh.gen.ts")).toString(),
}, {
  plugins: [
    decoPlugin({
      manifest: runningApps,
      site: { namespace: site },
    }),
  ],
});
