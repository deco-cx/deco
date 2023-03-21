// deno-lint-ignore-file no-explicit-any
import { HandlerContext } from "$fresh/server.ts";
import { HttpContext } from "$live/blocks/handler.ts";
import {
  newSingleFlightGroup,
  SingleFlightKeyFunc,
} from "$live/blocks/utils.ts";
import JsonViewer from "$live/blocks/utils.tsx";
import { BlockForModule, BlockModule } from "$live/engine/block.ts";
import { tsTypeToSchemeable } from "$live/engine/schema/transform.ts";
import { findExport, fnDefinitionRoot } from "$live/engine/schema/utils.ts";
import { LoaderFunction } from "$live/types.ts";

export type Function<TProps = any, TState = any> = LoaderFunction<
  TProps,
  any,
  TState
>;

export interface FunctionModule<
  TConfig = any,
  TState = any,
> extends BlockModule<any, Function<TConfig, TState>> {
  singleFlightKey?: SingleFlightKeyFunc<TConfig, HttpContext>;
}

const functionBlock: BlockForModule<FunctionModule> = {
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
  >(
    { default: func, singleFlightKey }: FunctionModule<TConfig, TState>,
  ) => [
    newSingleFlightGroup(singleFlightKey),
    async (
      $live: TConfig,
      ctx: HttpContext<any, any, HandlerContext<any, TState>>,
    ) => {
      const global = await ctx.resolve({ __resolveType: "globals" });
      const { data } = await func(
        ctx.request,
        {
          ...ctx.context,
          state: {
            ...ctx.context.state,
            $live,
            resolve: ctx.resolve,
            global,
          },
        },
        $live,
      );
      return data;
    },
  ],
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
