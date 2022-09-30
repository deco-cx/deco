import { Plugin } from "$fresh/server.ts";

export type GAOptions = {
  trackingId: string;
};

export default function ga(options: GAOptions): Plugin {
  const { trackingId } = options;
  const main = `data:application/javascript,export default function(state){
      var ga = document.createElement("script");
      ga.type = "text/partytown";
      ga.src = "https://www.googletagmanager.com/gtag/js?id=${trackingId}";
      document.head.appendChild(ga);

      var snippet = document.createElement("script");
      snippet.type = "text/partytown";
      snippet.innerHTML = \`
        window.dataLayer = window.dataLayer || [];
        function gtag() {
          window.dataLayer.push(arguments);
        }
        window.gtag = gtag;
        window.gtag("js", new Date());
        window.gtag("config", "${trackingId}")\`;
      document.head.appendChild(snippet);
    }`;
  return {
    name: "ga",
    entrypoints: { "main": main },
    render(ctx) {
      ctx.render();
      return {
        scripts: [{ entrypoint: "main", state: { trackingId } }],
      };
    },
  };
}
