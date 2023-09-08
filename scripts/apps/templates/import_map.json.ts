import type { InitContext } from "../context.ts";

export default function ImportMapJSON(
  { decoVersion }: InitContext,
) {
  return JSON.stringify(
    {
      "imports": {
        "$live/": `https://denopkg.com/deco-cx/deco@${decoVersion}/`,
        "deco/": `https://denopkg.com/deco-cx/deco@${decoVersion}/`,
        "$fresh/": "https://denopkg.com/deco-cx/fresh@1.3.6/",
        "preact": "npm:preact@10.15.1",
        "preact/": "npm:preact@10.15.1/",
        "preact-render-to-string": "npm:*preact-render-to-string@6.2.0",
        "@preact/signals": "npm:*@preact/signals@1.1.3",
        "@preact/signals-core": "npm:@preact/signals-core@1.3.0",
        "std/": "https://deno.land/std@0.190.0/",
        "partytown/": "https://deno.land/x/partytown@0.3.0/",
      },
    },
    null,
    2,
  );
}
