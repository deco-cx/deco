import { createCache } from "jsr:@deno/cache-dir@0.10.1";
import { assignComments } from "./comments.ts";
import { parse, type ParsedSource } from "./deps.ts";

const JS_REGEX_PATH: RegExp = /\.(m?js|cjs)$/;
/**
 * Check if js filepath
 * @return {boolean}
 */
const isJsFilePath = (filePath: string) => filePath.match(JS_REGEX_PATH);

/**
 * Tries to find a .d.ts file for a given JavaScript file in node_modules.
 * @param jsPath The path to the .js or .mjs file
 * @returns The path to the .d.ts file if found, undefined otherwise
 */
async function findTypeDefinitionFile(
  jsPath: string,
): Promise<string | undefined> {
  const url = new URL(jsPath);

  // Only process file:// protocol paths in node_modules
  if (
    url.protocol !== "file:" || !jsPath.includes("node_modules") ||
    !isJsFilePath(jsPath)
  ) {
    return undefined;
  }

  const pathStr = url.pathname;

  // Try common .d.ts file patterns
  const candidate: string = pathStr.replace(JS_REGEX_PATH, ".d.ts");

  try {
    const fileUrl = new URL(`file://${candidate}`);
    await Deno.stat(fileUrl);
    return fileUrl.href;
  } catch {
    // File doesn't exist, try next candidate
  }

  return undefined;
}

/**
 * Resolves a file path that may be missing an extension.
 * Tries common TypeScript/JavaScript extensions in order.
 * @param filePath The file path (with file:// protocol)
 * @returns The resolved file path with extension, or undefined if not found
 */
async function resolveFileExtension(
  filePath: string,
): Promise<string | undefined> {
  const url = new URL(filePath);

  // Only process file:// protocol paths
  if (url.protocol !== "file:") {
    return filePath;
  }

  const pathStr = url.pathname;

  // If the path already has a known extension, return it as-is
  if (pathStr.match(/\.(ts|tsx|js|jsx|mjs|cjs|d\.ts|d\.mts|d\.cts)$/)) {
    return filePath;
  }

  // Extensions to try, in order of preference
  const extensions = [
    ".d.ts", // TypeScript definitions (highest priority for type resolution)
    ".d.mts", // ESM TypeScript definitions
    ".d.cts", // CommonJS TypeScript definitions
    ".ts", // TypeScript source
    ".tsx", // TypeScript JSX
    ".mjs", // ESM JavaScript
    ".js", // JavaScript
    ".cjs", // CommonJS JavaScript
    ".jsx", // JSX
  ];

  // Try each extension
  for (const ext of extensions) {
    try {
      const candidatePath = pathStr + ext;
      const fileUrl = new URL(`file://${candidatePath}`);
      await Deno.stat(fileUrl);
      return fileUrl.href;
    } catch {
      // File doesn't exist, try next extension
      continue;
    }
  }

  // If no file found, try as a directory with index files
  const indexExtensions = [
    "/index.d.ts",
    "/index.d.mts",
    "/index.d.cts",
    "/index.ts",
    "/index.tsx",
    "/index.mjs",
    "/index.js",
    "/index.cjs",
    "/index.jsx",
  ];

  for (const indexExt of indexExtensions) {
    try {
      const candidatePath = pathStr + indexExt;
      const fileUrl = new URL(`file://${candidatePath}`);
      await Deno.stat(fileUrl);
      return fileUrl.href;
    } catch {
      // File doesn't exist, try next index extension
      continue;
    }
  }

  return undefined;
}

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
        // Check if this is a JavaScript file in node_modules
        const isJsFile = isJsFilePath(specifier);
        const isNodeModule = specifier.includes("node_modules");

        if (isJsFile && isNodeModule) {
          // Try to find and load the corresponding .d.ts file
          const dtsPath = await findTypeDefinitionFile(specifier);
          if (dtsPath) {
            try {
              const content = await Deno.readTextFile(new URL(dtsPath));
              return content;
            } catch (err) {
              console.log(
                "Failed to read .d.ts file, falling back to .js:",
                dtsPath,
                err,
              );
              // Fall through to load the original file
            }
          }
        }

        return await Deno.readTextFile(url);
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

/**
 * Wraps a loader to handle .d.ts file resolution for node_modules JavaScript files
 */
const wrapLoaderWithDtsSupport = (
  baseLoader: (specifier: string) => Promise<string | undefined>,
): typeof load => {
  return async (specifier: string): Promise<string | undefined> => {
    const isJsFile = specifier.match(/\.(m?js|cjs)$/);
    const isNodeModule = specifier.includes("node_modules");

    if (isJsFile && isNodeModule && specifier.startsWith("file:")) {
      // Try to find and load the corresponding .d.ts file
      const dtsPath = await findTypeDefinitionFile(specifier);
      if (dtsPath) {
        try {
          const dtsContent = await baseLoader(dtsPath);
          if (dtsContent) {
            return dtsContent;
          }
        } catch (err) {
          console.log(
            "Failed to load .d.ts file, falling back to .js:",
            dtsPath,
            err,
          );
          // Fall through to load the original file
        }
      }
    }

    return baseLoader(specifier);
  };
};

export const initLoader = (): typeof load => {
  if (loader) {
    return loader;
  }
  if (typeof Deno.permissions.querySync !== "undefined") {
    try {
      const cache = createCache();
      const cacheLoader = (specifier: string) =>
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

      return loader = wrapLoaderWithDtsSupport(cacheLoader);
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
    delete loadCache[filePath];
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
export const parsePath = async (
  path: string,
): Promise<ParsedSource | undefined> => {
  if (path.startsWith("npm:")) {
    console.warn(
      `%cnpm package ${path} could not be resolved in the schema parser, typings may be missing`,
      "color: gray",
    );
    return Promise.resolve(undefined);
  }

  // Try to resolve the file extension if the path doesn't have one
  let resolvedPath = path;
  if (path.startsWith("file:")) {
    const resolved = await resolveFileExtension(path);
    if (resolved) {
      resolvedPath = resolved;
    } else if (!path.match(/\.(ts|tsx|js|jsx|mjs|cjs|d\.ts|d\.mts|d\.cts)$/)) {
      // If resolution failed and path has no extension, return undefined instead of throwing
      console.warn(
        `%cCould not resolve path ${path}, file not found`,
        "color: gray",
      );
      return Promise.resolve(undefined);
    }
  }

  const mLoader = initLoader();
  return loadCache[resolvedPath] ??= mLoader(resolvedPath).then(
    async (content) => {
      if (!content && content !== "") {
        throw new Error(`Path not found ${resolvedPath}`);
      }
      try {
        return await parseContent(content);
      } catch (err) {
        console.log(err, resolvedPath);
        throw err;
      }
    },
  ).catch((err) => {
    delete loadCache[resolvedPath];
    throw err;
  });
};

if (import.meta.main) {
  const file = Deno.args[0];
  console.log(JSON.stringify(await parsePath(file)));
}
