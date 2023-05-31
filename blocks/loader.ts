// deno-lint-ignore-file no-explicit-any
import { HttpContext } from "$live/blocks/handler.ts";
import {
  FnProps,
  newSingleFlightGroup,
  SingleFlightKeyFunc,
} from "$live/blocks/utils.ts";
import JsonViewer from "$live/components/JsonViewer.tsx";
import { Block, BlockModule, InstanceOf } from "$live/engine/block.ts";
import { introspectWith } from "$live/engine/introspect.ts";
import { applyProps } from "./utils.ts";

export type Loader = InstanceOf<typeof loaderBlock, "#/root/loaders">;

export interface LoaderModule<
  TProps = any,
> extends BlockModule<FnProps<TProps>> {
  singleFlightKey?: SingleFlightKeyFunc<TProps, HttpContext>;
}

const loaderBlock: Block<LoaderModule> = {
  type: "loaders",
  introspect: introspectWith<LoaderModule>({
    "default": "0",
  }, true),
  adapt: <
    TProps = any,
  >(
    { singleFlightKey, ...mod }: LoaderModule<TProps>,
  ) =>
    singleFlightKey
      ? [
        newSingleFlightGroup(singleFlightKey),
        applyProps(mod),
      ]
      : applyProps(mod),
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
