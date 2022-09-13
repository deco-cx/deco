import { Plugin } from "$fresh/server.ts";
import { partytownSnippet } from "partytown";

export default function partytown(): Plugin {
  const main =
    `data:application/javascript,export default function(state){${partytownSnippet()}}`;
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
