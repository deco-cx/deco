import { waitKeys } from "$live/engine/core/utils.ts";
import {
  DOC_CACHE_FILE_NAME,
  hydrateDocCacheWith,
  LOCATION_TAG,
} from "$live/engine/schema/docCache.ts";
import { genSchemasFromManifest } from "$live/engine/schema/gen.ts";
import { denoDocLocalCache } from "$live/engine/schema/utils.ts";
import { context } from "$live/live.ts";
import { AppManifest } from "$live/types.ts";
import { compressFromJSON } from "$live/utils/zstd.ts";
import { join } from "std/path/mod.ts";

export const genSchemas = async (
  manifest: AppManifest,
  docCachePath?: string,
) => {
  const base = docCachePath ? join(Deno.cwd(), docCachePath) : Deno.cwd();
  const cachePath = join(base, DOC_CACHE_FILE_NAME);
  console.log(`🌟 live.ts is spinning up some magic for you! ✨ Hold tight!`);
  const start = performance.now();
  if (context.isDeploy) {
    try {
      await hydrateDocCacheWith(cachePath, `file://${Deno.cwd()}/`);
    } catch (e) {
      // ignore if not found
      if (!(e instanceof Deno.errors.NotFound)) {
        throw e;
      }
    }
  }
  const schema = await genSchemasFromManifest(
    manifest,
    base,
  );

  if (!context.isDeploy) {
    Deno.remove(join(Deno.cwd(), "schemas.gen.json")).catch((_err) => {
      // ignore err
    });
    // save cache on dev mode
    const docCache = await waitKeys(denoDocLocalCache);
    await Deno.writeFile(
      cachePath,
      compressFromJSON(
        docCache,
        (str: string) => str.replaceAll(`file://${base}/`, LOCATION_TAG),
      ),
    );
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
