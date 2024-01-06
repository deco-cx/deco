import { join } from "std/path/mod.ts";
import { genSchemasFromManifest } from "../../engine/schema/gen.ts";
import { context } from "../../deco.ts";
import { AppManifest } from "../../types.ts";
import { SourceMap } from "../../blocks/app.ts";

export const genSchemas = async (
  manifest: AppManifest,
  sourceMap: SourceMap = {},
) => {
  const base = Deno.cwd();
  const schema = await genSchemasFromManifest(
    manifest,
    base,
    sourceMap,
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
