import type { Plugin } from "$fresh/server.ts";
import type { AppManifest } from "@deco/deco";
import {
  type Config,
  plugin as tailwindPlugin,
} from "../../std/plugins/tailwind/mod.ts";
import decoPlugin, { type Options } from "./deco.ts";

const plugins = <TManifest extends AppManifest = AppManifest>(
  { tailwind, ...opts }: Options<TManifest> & { tailwind?: Config },
): Plugin[] => [tailwindPlugin(tailwind), decoPlugin(opts)];

export default plugins;
