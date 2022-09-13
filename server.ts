/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />
/// <reference lib="deno.unstable" />

import { Plugin, start as freshStart } from "$fresh/server.ts";

import twindPlugin, { Options } from "$fresh/plugins/twind.ts";
import { DecoManifest, LiveOptions } from "$live/types.ts";
import { setupLive } from "./live.tsx";

export const start = async (
  manifest: DecoManifest,
  twindConfig: Options,
  liveOptions?: LiveOptions,
) => {
  if (!liveOptions) {
    throw new Error("liveOptions.site is required.");
  }
  console.log("Running live server:", liveOptions);

  const port = parseInt(Deno.env.get("PORT") || "8080");
  setupLive(manifest, liveOptions);

  await freshStart(manifest, {
    port,
    plugins: [
      globalStyle(),
      twindPlugin(twindConfig),
    ],
  });
};

export const STYLE_ELEMENT_ID = "__DECO_GLOBAL";
export function globalStyle(styles?: string): Plugin {
  return {
    name: "globalStyle",
    render(ctx) {
      ctx.render();
      const cssText = styles || "html{height: 100%} body{height:100%}";
      return {
        styles: [{ cssText, id: STYLE_ELEMENT_ID }],
      };
    },
  };
}
