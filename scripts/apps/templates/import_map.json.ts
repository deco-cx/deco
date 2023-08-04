import { InitContext } from "$live/scripts/apps/init.ts";
import { format } from "$live/dev.ts";

export default async function AppLoadersBin(
  { appName, decoVersion }: InitContext,
) {
  return await format(
    `{
        "imports": {
          "${appName}/": "./app/",
          "$live/": "https://denopkg.com/deco-cx/deco@${decoVersion}/",
          "$fresh/": "https://denopkg.com/deco-cx/fresh@1.3.3/",
          "preact": "https://esm.sh/preact@10.15.1",
          "preact/": "https://esm.sh/preact@10.15.1/",
          "preact-render-to-string": "https://esm.sh/*preact-render-to-string@6.2.0",
          "@preact/signals": "https://esm.sh/*@preact/signals@1.1.3",
          "@preact/signals-core": "https://esm.sh/@preact/signals-core@1.3.0",
          "std/": "https://deno.land/std@0.190.0/"
        }
      }
      `,
  );
}
