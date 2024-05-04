import { join } from "std/path/mod.ts";
import { ImportMap } from "../../blocks/app.ts";
import { context } from "../../deco.ts";
import { genSchemasFromManifest } from "../../engine/schema/gen.ts";
import { AppManifest } from "../../types.ts";

export const genSchemas = async (
  manifest: AppManifest,
  importMap: ImportMap = { imports: {} },
) => {
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
