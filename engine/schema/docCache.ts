import { denoDocLocalCache } from "$live/engine/schema/utils.ts";
import { decompressToJSON } from "$live/utils/zstd.ts";
import { DocNode } from "https://deno.land/x/deno_doc@0.59.0/lib/types.d.ts";

const getFileBinary = async (url: string): Promise<Uint8Array> => {
  const response = await fetch(url, { redirect: "follow" });
  if (response.status !== 200) {
    // ensure the body is read as to not leak resources
    await response.arrayBuffer();
    return new Uint8Array();
  }
  return new Uint8Array(await response.arrayBuffer());
};

export const loadFromBinary = (binary: Uint8Array) => {
  return decompressToJSON<Record<string, DocNode[]>>(
    binary,
  );
};

export const loadFromFile = async (filePath: string) => {
  const loader = filePath.startsWith("http") ? getFileBinary : Deno.readFile;
  return loadFromBinary(
    await loader(filePath),
  );
};

/**
 * Hydrates the cache with the zstd file content given in the filepath parameter.
 */
export const hydrateDocCacheWith = async (
  filePath: string,
  keyResolver?: (key: string) => string,
) => {
  for (const [key, value] of Object.entries(await loadFromFile(filePath))) {
    denoDocLocalCache[keyResolver ? keyResolver(key) : key] ??= Promise.resolve(
      value,
    );
  }
};
