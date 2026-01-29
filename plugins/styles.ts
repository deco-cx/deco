/**
 * Styles Plugin
 *
 * @deprecated Fresh 2 handles styles differently via Vite. This plugin
 * is kept for Fresh 1.x backward compatibility.
 */

import type { Plugin } from "../runtime/fresh/plugin.tsx";

export const STYLE_ELEMENT_ID = "__DECO_GLOBAL_STYLES__";

/**
 * @deprecated Fresh 2 uses Vite for CSS handling. Use vite.config.ts instead.
 */
export default function stylesPlugin(styles?: string): Plugin {
  return {
    name: "styles",
    // Note: render() was a Fresh 1.x Plugin API feature
    // @ts-ignore - Fresh 1.x compatibility
    render(ctx) {
      ctx.render();
      const cssText = styles || "html{height: 100%} body{height:100%}";
      return {
        styles: [{ cssText, id: STYLE_ELEMENT_ID }],
      };
    },
  };
}
