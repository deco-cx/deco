import { build } from "./tailwind.ts";

await build();

if (Deno.args.includes("build")) {
  Deno.exit(0);
}
