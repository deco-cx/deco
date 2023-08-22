import {
  parse,
  ParsedSource,
} from "https://denopkg.com/deco-cx/deno_ast_wasm@0.1.0/mod.ts";
import { assignComments } from "./comments.ts";

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
        const response = await fetch(String(url), { redirect: "follow" });
        if (response.status !== 200) {
          // ensure the body is read as to not leak resources
          await response.arrayBuffer();
          return undefined;
        }
        const content = await response.text();
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
 * Parses the given path using the default loader. Caches the result in memory.
 */
export const parsePath = (path: string) => {
  return loadCache[path] ??= load(path).then(async (content) => {
    if (!content) {
      throw new Error(`Path not found ${path}`);
    }
    try {
      const source = await parse(content);
      assignComments(source);
      return source;
    } catch (err) {
      console.log(err, path);
      throw err;
    }
  });
};

if (import.meta.main) {
  const file = Deno.args[0];
  console.log(JSON.stringify(await parsePath(file)));
}
