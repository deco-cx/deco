import { Plugin } from "$fresh/server.ts";

export const STYLE_ELEMENT_ID = "__DECO_GLOBAL_STYLES__";

export default function stylesPlugin(styles?: string): Plugin {
  return {
    name: "styles",
    render(ctx) {
      ctx.render();
      const cssText = styles || "html{height: 100%} body{height:100%}";
      return {
        styles: [{ cssText, id: STYLE_ELEMENT_ID }],
      };
    },
  };
}
