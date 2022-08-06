/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />
/// <reference lib="deno.unstable" />

import {
  InnerRenderFunction,
  RenderContext,
  start as freshStart,
} from "$fresh/server.ts";

import { setup } from "twind";
import { shim, virtualSheet } from "twind/shim/server";
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

  const port = parseInt(Deno.env.get("PORT") || "8080");
  const sheet = virtualSheet();
  sheet.reset();
  setup({ ...manifest.twind, sheet });
  setupLive(manifest, liveOptions);

  function render(ctx: RenderContext, render: InnerRenderFunction) {
    const snapshot = ctx.state.get("twind") as unknown[] | null;
    sheet.reset(snapshot || undefined);

    // Support classic tailwind syntax.
    shim(render());

    ctx.styles.splice(0, ctx.styles.length, ...(sheet).target);
    ctx.styles.push("html{height: 100%} body{height:100%}");
    const newSnapshot = sheet.reset();
    ctx.state.set("twind", newSnapshot);
  }

  await freshStart(manifest, { render, port });
};
