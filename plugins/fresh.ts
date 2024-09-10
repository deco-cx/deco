import type { Plugin } from "$fresh/server.ts";
import type { AppManifest } from "../types.ts";
import {
  type Config,
  plugin as tailwindPlugin,
} from "https://cdn.jsdelivr.net/gh/deco-sites/std@1.26.8/plugins/tailwind/mod.ts";
import decoPlugin, { type Options } from "./deco.ts";

const plugins = <TManifest extends AppManifest = AppManifest>(
  { tailwind, ...opts }: Options<TManifest> & { tailwind?: Config },
): Plugin[] => [tailwindPlugin(tailwind), decoPlugin(opts)];

export default plugins;
