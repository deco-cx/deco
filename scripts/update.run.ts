import { codeMod, upgradeDeps } from "@deco/codemod-toolkit";

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
    upgradeDeps(PKGS_TO_CHECK, true),
  ],
});
