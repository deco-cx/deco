// deno-lint-ignore-file no-explicit-any
import { HandlerContext } from "$fresh/server.ts";
import { HttpContext } from "$live/blocks/handler.ts";
import { Block } from "$live/engine/block.ts";
import { tsTypeToSchemeable } from "$live/engine/schema/transform.ts";
import { findExport, fnDefinitionRoot } from "$live/engine/schema/utils.ts";
import { LoaderFunction } from "$live/types.ts";
import JsonViewer from "$live/blocks/utils.tsx";

export type Function<TProps = any, TState = any> = LoaderFunction<
  TProps,
  any,
  TState
>;

const functionBlock: Block<Function> = {
  type: "functions",
  defaultPreview: (result) => {
    return {
      Component: JsonViewer,
      props: { body: JSON.stringify(result, null, 2) },
    };
  },
  adapt: <
    TConfig = any,
    TState = any,
  >(func: {
    default: Function<TConfig, TState>;
  }) =>
  async (
    $live: TConfig,
    ctx: HttpContext<any, any, HandlerContext<any, TState>>,
  ) => {
    const { data } = await func.default(
      ctx.request,
      {
        ...ctx.context,
        state: {
          ...ctx.context.state,
          $live,
          resolve: ctx.resolve,
          global: await ctx.resolve("globals"),
        },
      },
      $live,
    );
    return data;
  },
  introspect: async (ctx, path, ast) => {
    const func = findExport("default", ast);
    if (!func) {
      return undefined;
    }
    const [fn, root] = await fnDefinitionRoot(ctx, func, [
      path,
      ast,
    ]);
    if (!fn) {
      throw new Error(
        `Default export of ${path} needs to be a const variable or a function`,
      );
    }

    const conf = fn.params[0];
    return {
      functionRef: path,
      inputSchema: conf.kind === "keyword" && (conf.keyword === "null" ||
          conf.keyword == "undefined")
        ? undefined
        : await tsTypeToSchemeable(conf, root),
      outputSchema: await tsTypeToSchemeable(fn.return, root),
    };
  },
};

/**
 * Functions are used in place to replace the legacy functions folder.
 * It supports basically the old loaders format.
 */
export default functionBlock;
