/**
 * Writes a site's static editor schemas (`genSchemas`) to a JSON file.
 * Spawned by `scripts/workerd.ts build` from the site root, with the site's
 * import map, so the Worker can serve /deco/meta without parsing TypeScript
 * at runtime.
 *
 *   deno run -A --config <site config> scripts/workerd_schemas.ts <out.json>
 */
import { exists } from "@std/fs";
import { join, toFileUrl } from "@std/path";
import { fromJSON } from "../engine/decofile/fetcher.ts";
import { genSchemas } from "../engine/schema/reader.ts";
import { Deco } from "../runtime/mod.ts";

const out = Deno.args[0];
if (!out) {
  console.error("usage: workerd_schemas.ts <out.json>");
  Deno.exit(1);
}
const manifest = (
  await import(toFileUrl(join(Deno.cwd(), "manifest.gen.ts")).href)
).default;
// Keep the site's decofile when it has one: apps installed through it (e.g.
// decohub) add their blocks to the manifest, and so to the schemas. Without
// one, deco has no decofile provider at all, so pass an empty decofile.
const hasDecofile = Deno.env.has("DECO_RELEASE") ||
  await exists(join(Deno.cwd(), ".deco", "blocks"), { isDirectory: true });
const deco = await Deco.init({
  manifest,
  ...(hasDecofile ? {} : { decofile: fromJSON({}) }),
});
const { manifest: resolved, importMap } = await deco.ctx.runtime!;
const schemas = await genSchemas(resolved, importMap);
await Deno.writeTextFile(out, JSON.stringify(schemas));
// Deco.init starts background work (decofile watchers, timers).
Deno.exit(0);
