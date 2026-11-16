import { join } from "@std/path";
import type { ImportMap } from "../../blocks/app.ts";
import { context } from "../../deco.ts";
import { genSchemasFromManifest } from "../../engine/schema/gen.ts";
import type { AppManifest } from "../../types.ts";
import type { Schemas } from "./builder.ts";

/**
 * Env var pointing at a JSON file with the output of `genSchemas`, generated
 * at build time. Runtimes that cannot parse TypeScript on the fly (Cloudflare
 * Workers: no source files, no runtime WASM compilation) serve the editor's
 * schemas from it. See scripts/workerd.ts.
 */
export const PRECOMPUTED_SCHEMAS_ENV = "DECO_SCHEMAS_FILE";

const readPrecomputedSchemas = async (): Promise<Schemas | undefined> => {
  const path = Deno.env.get(PRECOMPUTED_SCHEMAS_ENV);
  if (!path) return undefined;
  try {
    return JSON.parse(await Deno.readTextFile(path)) as Schemas;
  } catch (err) {
    console.error(`could not read precomputed schemas from ${path}`, err);
    return undefined;
  }
};

export const genSchemas = async (
  manifest: AppManifest,
  importMap: ImportMap = { imports: {} },
): Promise<Schemas> => {
  const precomputed = await readPrecomputedSchemas();
  if (precomputed) return precomputed;
  const base = Deno.cwd();
  const schema = await genSchemasFromManifest(
    manifest,
    base,
    importMap,
  );

  if (!context.isDeploy) {
    Deno.remove(join(Deno.cwd(), "schemas.gen.json")).catch((_err) => {
      // ignore err
    });
    Deno.remove(join(Deno.cwd(), "doccache.zst")).catch((_err) => {
      // ignore err
    });
  }

  return schema;
};
