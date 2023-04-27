// deno-lint-ignore-file no-explicit-any
import { HttpContext } from "$live/blocks/handler.ts";
import {
  FnProps,
  newSingleFlightGroup,
  SingleFlightKeyFunc,
} from "$live/blocks/utils.ts";
import JsonViewer from "$live/components/JsonViewer.tsx";
import { Block, BlockModule } from "$live/engine/block.ts";
import { introspectWith } from "$live/engine/introspect.ts";
import { LiveConfig, LoaderContext } from "$live/types.ts";
import { applyProps } from "./utils.ts";

export interface LoaderModule<
  TConfig = any,
  Ctx extends LoaderContext<LiveConfig<any, TConfig>> = LoaderContext<
    LiveConfig<any, TConfig>
  >,
> extends BlockModule<FnProps<any, any, Ctx>> {
  singleFlightKey?: SingleFlightKeyFunc<TConfig, HttpContext>;
}

const loaderBlock: Block<LoaderModule> = {
  type: "loaders",
  introspect: introspectWith<LoaderModule<any, LoaderContext<LiveConfig>>>({
    "default": ["1", "state.$live"],
  }, true),
  adapt: <
    TCtx extends LoaderContext<any> = LoaderContext<any>,
    TConfig = any,
  >(
    { singleFlightKey, ...mod }: LoaderModule<TConfig, TCtx>,
  ) => [
    newSingleFlightGroup(singleFlightKey),
    applyProps(mod),
  ],
  defaultPreview: (result) => {
    return {
      Component: JsonViewer,
      props: { body: JSON.stringify(result, null, 2) },
    };
  },
};

/**
 * <TResponse>(req:Request, ctx: HandlerContext<any, LiveConfig<TConfig>>) => Promise<TResponse> | TResponse
 * Loaders are arbitrary functions that always run in a request context, it returns the response based on the config parameters and the request.
 */
export default loaderBlock;
