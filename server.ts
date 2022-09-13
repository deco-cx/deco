/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />
/// <reference lib="deno.unstable" />

import { start as freshStart } from "$fresh/server.ts";

import { DecoManifest, LiveOptions } from "$live/types.ts";
import { setupLive } from "./live.tsx";

export const start = async (
  manifest: DecoManifest,
  liveOptions?: LiveOptions,
) => {
  if (!liveOptions) {
    throw new Error("liveOptions.site is required.");
  }
  console.log("Running live server:", liveOptions);

  const plugins = liveOptions.plugins || [];
  const port = parseInt(Deno.env.get("PORT") || "8080");
  setupLive(manifest, liveOptions);

  await freshStart(manifest, {
    port,
    plugins,
  });
};
