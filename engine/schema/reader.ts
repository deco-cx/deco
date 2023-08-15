import { genSchemasFromManifest } from "$live/engine/schema/gen.ts";
import { context } from "$live/live.ts";
import { AppManifest } from "$live/types.ts";
import { join } from "std/path/mod.ts";

export const genSchemas = async (
  manifest: AppManifest,
  docCachePath?: string,
) => {
  const base = docCachePath ? join(Deno.cwd(), docCachePath) : Deno.cwd();
  console.log(`🌟 live.ts is spinning up some magic for you! ✨ Hold tight!`);
  const start = performance.now();
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

  console.log(
    `✔️ ready to rock and roll! Your project is live 🤘 - took: ${
      Math.ceil(
        performance
          .now() - start,
      )
    }ms`,
  );
  return schema;
};
