import { Plugin } from "$fresh/server.ts";
import { partytownSnippet } from "partytown";

export default function partytown(): Plugin {
  const config = `
    window.partytown = {
      forward: ["gtag"],
      resolveUrl: function (url, location, type) {
        if (type === 'script') {
          var proxyUrl = new URL(location.protocol + '//' + location.host + '/live/proxy/gtag/js');
          proxyUrl.searchParams.append('id', url.searchParams.get('id'));
          return proxyUrl;
        }
        return url;
      },
    }`;
  const main =
    `data:application/javascript,export default function(state){${config};${partytownSnippet()}}`;
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
