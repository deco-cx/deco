// deno-lint-ignore-file no-explicit-any
import type { HttpContext } from "../blocks/handler.ts";
import { wrapCaughtErrors } from "../blocks/loader.ts";
import {
  newSingleFlightGroup,
  type SingleFlightKeyFunc,
} from "../blocks/utils.ts";
import JsonViewer from "../components/JsonViewer.tsx";
import type { Block, BlockModule } from "../engine/block.ts";
import type { HandlerContext } from "../engine/manifest/manifest.ts";
import type { DecoState, LoaderFunction } from "../types.ts";

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
    includeReturn: true,
  },
  adapt: <
    TConfig = any,
    TState = any,
  >(
    { default: func, singleFlightKey }: FunctionModule<TConfig, TState>,
  ) => [
    wrapCaughtErrors,
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
          } as DecoState<any, any>,
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
