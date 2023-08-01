import { denoDocLocalCache } from "$live/engine/schema/utils.ts";
import { decompressToJSON } from "$live/utils/zstd.ts";
import { DocNode } from "https://deno.land/x/deno_doc@0.59.0/lib/types.d.ts";

/**
 * Hydrates the cache with the zstd file content given in the filepath parameter.
 */
export const hydrateDocCacheWith = async (
  filePath: string,
  keyResolver?: (key: string) => string,
) => {
  const cache = decompressToJSON<Record<string, DocNode[]>>(
    await Deno.readFile(filePath),
  );

  for (const [key, value] of Object.entries(cache)) {
    denoDocLocalCache[keyResolver ? keyResolver(key) : key] ??= Promise.resolve(
      value,
    );
  }
};
