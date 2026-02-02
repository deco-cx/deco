import { join } from "@std/path";
import type { ImportMap } from "../../blocks/app.ts";
import denoJSON from "../../deno.json" with { type: "json" };
import { genSchemasFromManifest } from "../../engine/schema/gen.ts";
import type { AppManifest } from "../../types.ts";
import type { Schemas } from "./builder.ts";

const SCHEMA_CACHE_FILE = "schemas.gen.json";

interface SchemaCache {
  manifestHash: string;
  decoVersion: string;
  timestamp: number;
  schema: Schemas;
}

// Simple hash of manifest keys to detect changes
const hashManifest = (manifest: AppManifest): string => {
  const { baseUrl: _ignore, name: _ignoreName, ...blocks } = manifest;
  const keys: string[] = [];
  for (const [blockType, blockValues] of Object.entries(blocks)) {
    for (const blockKey of Object.keys(blockValues as Record<string, unknown>)) {
      keys.push(`${blockType}:${blockKey}`);
    }
  }
  keys.sort();
  return keys.join("|");
};

const loadSchemaCache = async (manifestHash: string): Promise<Schemas | null> => {
  try {
    const cachePath = join(Deno.cwd(), SCHEMA_CACHE_FILE);
    const content = await Deno.readTextFile(cachePath);
    const cache: SchemaCache = JSON.parse(content);
    // Invalidate cache if manifest changed OR deco version changed
    if (cache.manifestHash === manifestHash && cache.decoVersion === denoJSON.version) {
      return cache.schema;
    }
    return null;
  } catch {
    return null;
  }
};

const saveSchemaCache = async (manifestHash: string, schema: Schemas): Promise<void> => {
  try {
    const cachePath = join(Deno.cwd(), SCHEMA_CACHE_FILE);
    const cache: SchemaCache = {
      manifestHash,
      decoVersion: denoJSON.version,
      timestamp: Date.now(),
      schema,
    };
    await Deno.writeTextFile(cachePath, JSON.stringify(cache));
  } catch {
    // Ignore cache save errors
  }
};

export const genSchemas = async (
  manifest: AppManifest,
  importMap: ImportMap = { imports: {} },
) => {
  const manifestHash = hashManifest(manifest);

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
