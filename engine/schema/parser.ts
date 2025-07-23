import { createCache } from "jsr:@deno/cache-dir@0.10.1";
import { assignComments } from "./comments.ts";
import { parse, type ParsedSource } from "./deps.ts";

/**
 * Loads the content of the given specifier.
 * @param specifier The string location of the module specifier.
 */
async function load(
  specifier: string,
): Promise<string | undefined> {
  const url = new URL(specifier);
  try {
    switch (url.protocol) {
      case "file:": {
        // Check file content cache first
        const filePath = url.pathname;
        const cached = fileContentCache[filePath];
        if (cached) {
          try {
            const stat = await Deno.stat(url);
            if (stat.mtime?.getTime() === cached.mtime) {
              return cached.content;
            }
          } catch {
            // If stat fails, continue to read file
          }
        }
        
        let result: string;
        
        try {
          // Method 1: Direct file reading
          result = await Deno.readTextFile(url);
        } catch (error) {
          console.log(`%c load: Deno.readTextFile failed for ${url}:`, "color: red", error);
          
          // Method 2: Try reading as bytes first
          try {
            const bytes = await Deno.readFile(url);
            result = new TextDecoder().decode(bytes);
          } catch (bytesError) {
            console.log(`%c load: Deno.readFile also failed for ${url}:`, "color: red", bytesError);
            throw error; // Re-throw original error
          }
        }
        
        // Cache the content with modification time
        try {
          const stat = await Deno.stat(url);
          fileContentCache[filePath] = {
            content: result,
            mtime: stat.mtime?.getTime() ?? Date.now(),
          };
        } catch {
          // If stat fails, still cache without mtime
          fileContentCache[filePath] = {
            content: result,
            mtime: Date.now(),
          };
        }
        
        return result;
      }
      case "http:":
      case "https:": {
        const response = await fetch(String(url), { redirect: "follow" }).catch(
          (err) => {
            console.log("error when trying fetch from, retrying", url, err);
            return fetch(String(url), { redirect: "follow" });
          },
        );
        const content = await response.text().catch((err) => {
          console.log("err parsing text", url, err);
          return undefined;
        });
        if (response.status >= 400) {
          // ensure the body is read as to not leak resources
          console.error(
            `error fetching ${url}`,
            response.status,
            content,
          );
          return undefined;
        }
        return content;
      }
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}

const loadCache: Record<string, Promise<ParsedSource | undefined>> = {};
const fileContentCache: Record<string, { content: string; mtime: number }> = {};

/**
 * Parses the given content.
 */
export const parseContent = async (content: string) => {
  const source = await parse(content);
  assignComments(source);
  return source;
};

const decoder = new TextDecoder();
let loader: null | typeof load = null;
export const initLoader = (): typeof load => {
  if (loader) {
    return loader;
  }
  if (typeof Deno.permissions.querySync !== "undefined") {
    try {
      const cache = createCache();
      return loader = (specifier) =>
        cache.load(specifier).then((cached) => {
          const content = (cached as { content: string | Uint8Array })?.content;
          if (!content) {
            return undefined;
          }
          if (typeof content === "string") {
            return content;
          }
          return decoder.decode(content);
        });
    } catch {
      return loader = load;
    }
  }
  return loader = load;
};
export let schemaVersion = crypto.randomUUID();
addEventListener("hmr", (e) => {
  const filePath = (e as unknown as { detail: { path: string } })?.detail?.path;
  if (filePath) {
    // Clear cache for multiple possible path formats
    const possiblePaths = [
      filePath,
      `file://${filePath}`,
      new URL(filePath, `file://${Deno.cwd()}/`).href,
      filePath.replace(/\\/g, '/'), // Windows path normalization
      filePath.replace(/\//g, '\\'), // Unix path normalization
    ];
    
    for (const path of possiblePaths) {
      delete loadCache[path];
      delete fileContentCache[path];
    }
    
    // Also clear all caches if it's a major change
    if (filePath.includes('manifest.gen.ts') || filePath.includes('blocks.json')) {
      console.log(`%c HMR: Clearing all caches due to ${filePath}`, "color: orange");
      Object.keys(loadCache).forEach(key => delete loadCache[key]);
      Object.keys(fileContentCache).forEach(key => delete fileContentCache[key]);
    }
    
    schemaVersion = crypto.randomUUID();
  }
});

export const updateLoadCache = (path: string, content: string) => {
  if (!loadCache[path]) {
    return;
  }
  const prev = loadCache[path];
  loadCache[path] = parseContent(content).catch((err) => {
    console.log("error parsing content", err, path);
    return prev;
  });
};

/**
 * Parses the given path using the default loader. Caches the result in memory.
 */
export const parsePath = (path: string): Promise<ParsedSource | undefined> => {
  if (path.startsWith("npm:")) {
    console.warn(
      `%cnpm package ${path} could not be resolved in the schema parser, typings may be missing`,
      "color: gray",
    );
    return Promise.resolve(undefined);
  }
  const mLoader = initLoader();
  const cached = loadCache[path];
  if (cached) {
    return cached;
  }
  return loadCache[path] = mLoader(path).then(async (content) => {
    if (!content && content !== "") {
      throw new Error(`Path not found ${path}`);
    }
    try {
      return await parseContent(content);
    } catch (err) {
      console.log(err, path);
      throw err;
    }
  }).catch((err) => {
    delete loadCache[path];
    throw err;
  });
};

if (import.meta.main) {
  const file = Deno.args[0];
  console.log(JSON.stringify(await parsePath(file)));
}
