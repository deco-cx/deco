import { join } from "std/path/mod.ts";
import { ImportMapResolver } from "../../blocks/app.ts";
import { context } from "../../deco.ts";
import { genSchemasFromManifest } from "../../engine/schema/gen.ts";
import { AppManifest } from "../../types.ts";

export const genSchemas = async (
  manifest: AppManifest,
  importMap: ImportMapResolver,
) => {
  const base = Deno.cwd();
  const schema = await genSchemasFromManifest(
    manifest,
    importMap,
    base,
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
