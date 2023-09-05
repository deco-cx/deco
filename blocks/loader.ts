// deno-lint-ignore-file no-explicit-any
import { HttpContext } from "../blocks/handler.ts";
import {
  applyProps,
  FnProps,
  newSingleFlightGroup,
  SingleFlightKeyFunc,
} from "../blocks/utils.tsx";
import JsonViewer from "../components/JsonViewer.tsx";
import { Block, BlockModule, InstanceOf } from "../engine/block.ts";
import { ResolverMiddlewareContext } from "../engine/middleware.ts";

export type Loader = InstanceOf<typeof loaderBlock, "#/root/loaders">;

export interface LoaderModule<
  TProps = any,
> extends BlockModule<FnProps<TProps>> {
  singleFlightKey?: SingleFlightKeyFunc<TProps, HttpContext>;
}
export interface WrappedError {
  __isErr: true;
}
export const isWrappedError = (
  err: any | WrappedError,
): err is WrappedError => {
  return (err as WrappedError)?.__isErr;
};

export const wrapCaughtErrors = async <
  TConfig = any,
  TContext extends ResolverMiddlewareContext<any> = ResolverMiddlewareContext<
    any
  >,
>(_props: TConfig, ctx: TContext) => {
  try {
    return await ctx.next!();
  } catch (err) {
    return new Proxy(err, {
      get: (_target, prop) => {
        if (prop === "then") {
          return undefined;
        }
        if (prop === "__isErr") {
          return true;
        }
        throw err;
      },
    });
  }
};
const loaderBlock: Block<LoaderModule> = {
  type: "loaders",
  introspect: { includeReturn: true },
  adapt: <
    TProps = any,
  >(
    { singleFlightKey, ...mod }: LoaderModule<TProps>,
  ) =>
    singleFlightKey
      ? [
        wrapCaughtErrors,
        newSingleFlightGroup(singleFlightKey),
        applyProps(mod),
      ]
      : [
        wrapCaughtErrors,
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
