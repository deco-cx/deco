#!/usr/bin/env -S deno run -A --watch=static/,routes/
import { join, toFileUrl } from "std/path/mod.ts";
import "std/dotenv/load.ts";
import { walk } from "std/fs/walk.ts";
import { JSONSchema7 } from "json-schema";
import { getSchemaFromExport } from "./schema.ts";

interface Manifest {
  configs: string[];
  schemas: Record<
    string,
    JSONSchema7
  >;
}

export async function collectFilesFromDir(dir: string) {
  const files = [];
  try {
    const dirURL = toFileUrl(dir);
    // TODO(lucacasonato): remove the extranious Deno.readDir when
    // https://github.com/denoland/deno_std/issues/1310 is fixed.
    for await (const _ of Deno.readDir(dir)) {
      // do nothing
    }

    const filesFromDir = walk(dir, {
      includeDirs: false,
      includeFiles: true,
      exts: ["tsx", "jsx", "ts", "js"],
    });

    for await (const entry of filesFromDir) {
      if (entry.isFile) {
        const file = toFileUrl(entry.path).href.substring(dirURL.href.length);
        files.push(file);
      }
    }
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      // Do nothing.
    } else {
      throw err;
    }
  }
  files.sort();

  return files;
}

async function collectConfigs(dir: string): Promise<string[]> {
  const configsDir = join(dir, "./config");

  const configNames = await collectFilesFromDir(configsDir);

  return configNames;
}

/**
 * Extracts JSONSChemas from types definitions in sections and functions.
 *
 * Read more about it here: TODO
 */
async function extractAllSchemas(
  functions: string[],
): Promise<Manifest["schemas"]> {
  const functionSchemasAsArray = await Promise.all(
    functions.map(async (functionName) => {
      const path = `./functions${functionName}`;
      const functionSchema = await getSchemaFromExport(path);

      return [
        path,
        functionSchema,
      ] as const;
    }),
  );

  const schemas = Object.fromEntries([
    ...functionSchemasAsArray,
  ]);

  return schemas;
}

export default async function generate(dir: string): Promise<Manifest> {
  const configs = await collectConfigs(dir);
  const schemas = await extractAllSchemas(configs);

  return {
    configs,
    schemas,
  };
}

// Run directly if called as a script
if (import.meta.main) {
  const results = await generate(Deno.cwd());
  console.log(results);
}
