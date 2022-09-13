import { Plugin } from "$fresh/server.ts";

export type JitsuOptions = {
  key: string;
};

export default function jitsu(options: JitsuOptions): Plugin {
  const { key } = options;
  const main = `data:application/javascript,export default function(state){
      var jitsu = document.createElement("script");
      jitsu.type = "text/partytown";
      jitsu.src="https://t.jitsu.com/s/lib.js";
      jitsu.setAttribute("data-key", state.key);
      document.head.appendChild(jitsu);

      var snippet = document.createElement("script");
      snippet.type = "text/partytown";
      snippet.innerHTML = \`window.jitsu = window.jitsu || (function(){(window.jitsuQ = window.jitsuQ || []).push(arguments);})\`;
      document.head.appendChild(snippet);
    }`;
  return {
    name: "jitsu",
    entrypoints: { "main": main },
    render(ctx) {
      ctx.render();
      return {
        scripts: [{ entrypoint: "main", state: { key } }],
      };
    },
  };
}
