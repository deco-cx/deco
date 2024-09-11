import { codeMod, denoJSON, upgradeDeps } from "@deco/codemod-toolkit";
import type { DenoJSON } from "@deco/codemod-toolkit/deno-json";
const decoDenoJSONPromise: Promise<DenoJSON> = fetch(
  "https://raw.githubusercontent.com/deco-cx/deco/main/deno.json",
).then(
  (res) => res.json(),
);

const PKGS_TO_CHECK =
  /(@deco\/.*)|(apps)|(deco)|(\$live)|(deco-sites\/.*\/$)|(partytown)/;
await codeMod({
  yPrompt: false,
  targets: [
    {
      options: {
        match: [/fresh.config.ts$/],
      },
      apply: (txt) => {
        const regex = /^import plugins from ".*";$/gm;
        return {
          content: txt.content.replace(
            regex,
            `import plugins from "deco/plugins/fresh.ts";`,
          ),
        };
      },
    },
    denoJSON(async (denoJSON) => {
      const { "deco/": _, ...imports } = (await decoDenoJSONPromise).imports ??
        {};
      return {
        content: {
          ...denoJSON.content,
          imports: {
            ...imports,
            ...denoJSON.content.imports ?? {},
          },
        },
      };
    }),
    upgradeDeps(PKGS_TO_CHECK, true),
  ],
});
