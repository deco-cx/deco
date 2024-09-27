export * from "../runtime/fresh/plugin.ts";
import type { AppManifest } from "@deco/deco";
import { default as plugin, type Options } from "../runtime/fresh/plugin.ts";

/**
 * backwards compatibility with old fresh+deco plugin
 */
export const plugins = <TManifest extends AppManifest = AppManifest>(
  opts: Options<TManifest>,
) => {
  return [
    plugin(opts),
  ];
};

export default plugin;
