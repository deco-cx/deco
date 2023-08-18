import { join } from "std/path/mod.ts";
import { genSchemasFromManifest } from "../../engine/schema/gen.ts";
import { context } from "../../live.ts";
import { AppManifest } from "../../types.ts";

export const genSchemas = async (
  manifest: AppManifest,
  subDir?: string,
) => {
  const base = subDir ? join(Deno.cwd(), subDir) : Deno.cwd();
  const schema = await genSchemasFromManifest(
    manifest,
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
