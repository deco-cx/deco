import { Plugin } from "$fresh/server.ts";
import { PartytownConfig, partytownSnippet } from "partytown";

export default function partytown(config: PartytownConfig): Plugin {
  const main = `data:application/javascript,export default function(state){${
    partytownSnippet(config)
  }}`;
  return {
    name: "partytown",
    entrypoints: { "main": main },
    render(ctx) {
      ctx.render();
      return {
        scripts: [{ entrypoint: "main", state: {} }],
      };
    },
  };
}
