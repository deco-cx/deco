import { createCache } from "jsr:@deno/cache-dir@0.8.0";
import { assignComments } from "./comments.ts";
import { parse, ParsedSource } from "./deps.ts";

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
const initLoader = (): typeof load => {
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
export const parsePath = (path: string) => {
  const mLoader = initLoader();
  return loadCache[path] ??= mLoader(path).then(async (content) => {
    if (!content) {
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
