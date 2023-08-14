import {
  parse,
  ParsedSource,
} from "https://denopkg.com/deco-cx/deno_ast_wasm@0.1.0/mod.ts";

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
  return loadCache[path] ??= load(path).then((content) => {
    if (!content) {
      console.log("UNDEFINED", path);
      throw new Error(`UNDEFINED ${path}`)
      return undefined;
    }
    try {
      return parse(content);
    } catch (err) {
      console.log(err, path);
      throw err;
    }
  });
};

if (import.meta.main) {
  console.log(
    JSON.stringify(parse(
      `import { HandlerContext } from "$fresh/server.ts";
import { Page } from "$live/blocks/page.ts";
import { RouterContext } from "$live/types.ts";
import { allowCorsFor } from "$live/utils/http.ts";
import { ConnInfo } from "std/http/server.ts";
import { FreshConfig as FRESHCONFIG } from "$live/fresh.ts";
export { default, loader } from "$store/components/ui/CategoryBanner.tsx";

type Mapped = {
  [key in keyof FreshConfig]?: FreshConfig[key];
}

export const s = () => {

} satisfies FRESHCONFIG ;
// test
export function ss() {}
type Omitted = Omit<FreshConfig, "key" | "otherKey">
interface FCS extends FRESHCONFIG {
  /**
   * @max 100
   */
  a: string
  b: 10
  c?: string
  d: {
    k: number;
  }
  sssss: Partial<FRESHCONFIG>;
  kkkk: Record<string, number>;
  sss: Promise<string>;
  kk: string[]
  kkk: Array<string>
  x: ConnInfo["abcde"]
  y: number | string | ConnInfo["abcdef"]
}
type FC = FRESHCONFIG
export const isFreshCtx = <TState>(
  ctx: ConnInfo | HandlerContext<unknown, TState>,
): ctx is HandlerContext<unknown, TState> => {
  return typeof (ctx as HandlerContext).render === "function";
};

`,
    )),
  );
}
