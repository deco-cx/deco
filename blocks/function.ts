// deno-lint-ignore-file no-explicit-any
import { HandlerContext } from "$fresh/server.ts";
import { HttpContext } from "$live/blocks/handler.ts";
import {
  newSingleFlightGroup,
  SingleFlightKeyFunc,
} from "$live/blocks/utils.ts";
import JsonViewer from "$live/blocks/utils.tsx";
import { BlockForModule, BlockModule } from "$live/engine/block.ts";
import { introspectWith } from "$live/engine/introspect.ts";
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
  introspect: introspectWith<FunctionModule>({ default: "0" }, true),
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
      const global = await ctx.resolve({ __resolveType: "accounts" });
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
  defaultPreview: (result) => {
    return {
      Component: JsonViewer,
      props: { body: JSON.stringify(result, null, 2) },
    };
  },
};

/**
 * Functions are used in place to replace the legacy functions folder.
 * It supports basically the old loaders format.
 */
export default functionBlock;
