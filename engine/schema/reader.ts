import { waitKeys } from "$live/engine/core/utils.ts";
import { Schemas } from "$live/engine/schema/builder.ts";
import { channel } from "$live/engine/schema/docServer.ts";
import { genSchemasFromManifest } from "$live/engine/schema/gen.ts";
import { denoDocLocalCache } from "$live/engine/schema/utils.ts";
import { context } from "$live/live.ts";
import { DecoManifest } from "$live/types.ts";
import { compressFromJSON, decompressToJSON } from "$live/utils/zstd.ts";
import { stringifyForWrite } from "$live/utils/json.ts";
import { join } from "std/path/mod.ts";

const cacheFile = "doccache.zst";
export const genSchemas = async (manifest: DecoManifest) => {
  const cachePath = join(Deno.cwd(), cacheFile);
  console.log(`🌟 live.ts is spinning up some magic for you! ✨ Hold tight!`);
  const start = performance.now();
  if (context.isDeploy) {
    try {
      const cache = decompressToJSON<Record<string, DocNode[]>>(
        await Deno.readFile(cachePath),
      );

      for (const [key, value] of Object.entries(cache)) {
        denoDocLocalCache[key] ??= Promise.resolve(value);
      }
    } catch (e) {
      // ignore if not found
      if (!(e instanceof Deno.errors.NotFound)) {
        throw e;
      }
    }
  }
  const schema = await genSchemasFromManifest(
    manifest,
  );

  if (channel) {
    (await channel)?.close();
  } else if (!context.isDeploy) {
    // save cache on dev mode
    const docCache = await waitKeys(denoDocLocalCache);
    await Deno.writeFile(
      cachePath,
      compressFromJSON(docCache),
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

const cache: Record<string, Promise<Schemas>> = {};
export const getCurrent = (manifest: DecoManifest): Promise<Schemas> => {
  const key = JSON.stringify(manifest);
  return cache[key] ??= genSchemas(manifest);
};
