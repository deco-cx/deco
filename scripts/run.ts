// TODO: @gimenes use redirect instead of serving this file

import denoJSON from "../deno.json" with { type: "json" };

const packageName = "@deco/deco";

const version = Deno.env.get("DECO_VERSION") ?? denoJSON.version ?? "1";

console.log(
  `%cusing ${version} version of ${packageName}`,
  "color: gray",
);

await import(`jsr:${packageName}@${version}/scripts/run`);
