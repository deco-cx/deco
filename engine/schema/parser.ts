import {
  parse,
  ParsedSource,
} from "https://denopkg.com/deco-cx/deno_ast_wasm@0.1.0/mod.ts";
import { assignComments } from "./comments.ts";
import { programToBlockRef } from "./transform.ts";

/** A Deno specific loader function that can be passed to the
 * `createModuleGraph` which will use `Deno.readTextFile` for local files, or
 * use `fetch()` for remote modules.
 *
 * @param specifier The string module specifier from the module graph.
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
  console.log(
    JSON.stringify(
      await parse(
        `
const s = 10;
/**
 * @title SISIS
 */
interface IS {
  // teste 3
  a: string
}
/**
 * @title TESTE
 */
export default function TESTE(ts: IS) {
  // my const
  const s = 10;
}
        `,
      ).then((s) => {
        return programToBlockRef("./teste.ts", s);
      }),
    ),
  );
}
