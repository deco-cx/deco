import { join } from "@std/path";
import type { ImportMap } from "../../blocks/app.ts";
import { genSchemasFromManifest } from "../../engine/schema/gen.ts";
import type { AppManifest } from "../../types.ts";
import type { Schemas } from "./builder.ts";

const SCHEMA_CACHE_FILE = "schemas.gen.json";

interface SchemaCache {
  manifestHash: string;
  schema: Schemas;
}

// Hash manifest keys and file modification times to detect changes
const hashManifest = async (manifest: AppManifest): Promise<string> => {
  const { baseUrl: _ignore, name: _ignoreName, ...blocks } = manifest;
  const entries: string[] = [];

  for (const [blockType, blockValues] of Object.entries(blocks)) {
    for (
      const blockKey of Object.keys(blockValues as Record<string, unknown>)
    ) {
      // Try to get file modification time to detect implementation changes
      let mtime = "";
      try {
        // blockKey is the file path (e.g., "site/sections/Hero.tsx")
        const stat = await Deno.stat(blockKey);
        mtime = stat.mtime?.getTime().toString() ?? "";
      } catch {
        // If file doesn't exist or can't be read, use empty mtime
        // This is fine - we still track the key itself
      }
      entries.push(`${blockType}:${blockKey}:${mtime}`);
    }
  }

  entries.sort();
  return entries.join("|");
};

const loadSchemaCache = async (
  manifestHash: string,
): Promise<Schemas | null> => {
  try {
    const cachePath = join(Deno.cwd(), SCHEMA_CACHE_FILE);
    const content = await Deno.readTextFile(cachePath);
    const cache: SchemaCache = JSON.parse(content);
    if (cache.manifestHash === manifestHash) {
      return cache.schema;
    }
    return null;
  } catch {
    return null;
  }
};

const saveSchemaCache = async (
  manifestHash: string,
  schema: Schemas,
): Promise<void> => {
  try {
    const cachePath = join(Deno.cwd(), SCHEMA_CACHE_FILE);
    const cache: SchemaCache = { manifestHash, schema };
    await Deno.writeTextFile(cachePath, JSON.stringify(cache));
  } catch {
    // Ignore cache save errors
  }
};

export const genSchemas = async (
  manifest: AppManifest,
  importMap: ImportMap = { imports: {} },
) => {
  const manifestHash = await hashManifest(manifest);

  // Try to load from cache first
  const cached = await loadSchemaCache(manifestHash);
  if (cached) {
    return cached;
  }

  // Generate fresh schema
  const base = Deno.cwd();
  const schema = await genSchemasFromManifest(
    manifest,
    base,
    importMap,
  );

  // Save to cache (don't await, do in background)
  saveSchemaCache(manifestHash, schema);

  return schema;
};
