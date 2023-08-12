import { parse } from "https://deno.land/x/swc@0.2.1/mod.ts";
import { Program } from "https://esm.sh/v130/@swc/core@1.2.212/types.d.ts";

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

const loadCache: Record<string, Promise<Program | undefined>> = {};
export const parsePath = (path: string) => {
  return loadCache[path] ??= load(path).then((content) => {
    if (!content) {
      return undefined;
    }
    return parse(content.replaceAll("satisfies", "as"), {
      target: "es2022",
      syntax: "typescript",
      tsx: true,
      comments: true,
      script: true,
    });
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

type Mapped = {
  [key in keyof FreshConfig]?: FreshConfig[key];
}

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

/**
 * @title Fresh Page
 * @description Renders a fresh page.
 */
export default function Fresh(page: FC) {
  return async (req: Request, ctx: ConnInfo) => {
    const url = new URL(req.url);
    if (url.searchParams.get("asJson") !== null) {
      return Response.json(page, { headers: allowCorsFor(req) });
    }
    if (isFreshCtx<{ routerInfo: RouterContext }>(ctx)) {
      return await ctx.render({ ...page, routerInfo: ctx.state.routerInfo });
    }
    return Response.json({ message: "Fresh is not being used" }, {
      status: 500,
    });
  };
}
`,
      {
        target: "es2022",
        syntax: "typescript",
        tsx: true,
        comments: true,
        script: true,
      },
    )),
  );
}
