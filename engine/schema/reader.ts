import { join } from "../../compat/std-path.ts";
import type { ImportMap } from "../../blocks/app.ts";
import { cwd, fs } from "../../compat/mod.ts";
import { context } from "../../deco.ts";
import { genSchemasFromManifest } from "../../engine/schema/gen.ts";
import type { AppManifest } from "../../types.ts";

export const genSchemas = async (
  manifest: AppManifest,
  importMap: ImportMap = { imports: {} },
) => {
  const base = cwd();
  const schema = await genSchemasFromManifest(
    manifest,
    base,
    importMap,
  );

  if (!context.isDeploy) {
    fs.remove(join(cwd(), "schemas.gen.json")).catch((_err) => {
      // ignore err
    });
    fs.remove(join(cwd(), "doccache.zst")).catch((_err) => {
      // ignore err
    });
  }

  return schema;
};
