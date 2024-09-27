export * from "../runtime/fresh/plugin.ts";
import plugin from "../runtime/fresh/plugin.ts";

/**
 * backwards compatibility with old fresh+deco plugin
 */
export const plugins = (...opt: Parameters<typeof plugin>) => {
  return [
    plugin(...opt),
  ];
};

export default plugin;
