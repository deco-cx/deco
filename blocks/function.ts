// deno-lint-ignore-file no-explicit-any
import { HandlerContext } from "$fresh/server.ts";
import { HttpContext } from "$live/blocks/handler.ts";
import {
  newSingleFlightGroup,
  SingleFlightKeyFunc,
} from "$live/blocks/utils.tsx";
import JsonViewer from "$live/components/JsonViewer.tsx";
import { Block, BlockModule } from "$live/engine/block.ts";
import { LiveConfig, LoaderFunction } from "$live/types.ts";

export type Function<TProps = any, TState = any> = LoaderFunction<
  TProps,
  any,
  TState
>;

export interface FunctionModule<
  TConfig = any,
  TState = any,
> extends BlockModule<Function<TConfig, TState>> {
  singleFlightKey?: SingleFlightKeyFunc<TConfig, HttpContext>;
}

const functionBlock: Block<FunctionModule> = {
  type: "functions",
  introspect: {
    includeReturn: (ts) => {
      return ts;
    },
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
      const { data } = await func(
        ctx.request,
        {
          ...ctx.context,
          state: {
            ...ctx.context.state,
            $live,
            resolve: ctx.resolve,
          } as LiveConfig<any, any>,
        },
        $live,
      );
      return data;
    },
  ],
  defaultDanglingRecover: () => {
    return { data: null };
  },
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
