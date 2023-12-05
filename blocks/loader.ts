// deno-lint-ignore-file no-explicit-any
import hash from "npm:object-hash";
import JsonViewer from "../components/JsonViewer.tsx";
import { ValueType } from "../deps.ts";
import { Block, BlockModule, InstanceOf } from "../engine/block.ts";
import { singleFlight } from "../engine/core/utils.ts";
import { ResolverMiddlewareContext } from "../engine/middleware.ts";
import { meter } from "../observability/otel/metrics.ts";
import { caches } from "../runtime/caches/denoKV.ts";
import { HttpContext } from "./handler.ts";
import {
  applyProps,
  FnContext,
  FnProps,
  SingleFlightKeyFunc,
} from "./utils.tsx";

export type Loader = InstanceOf<typeof loaderBlock, "#/root/loaders">;

export interface LoaderModule<
  TProps = any,
  TState = any,
> extends BlockModule<FnProps<TProps>> {
  cache?: "no-store" | "stale-while-revalidate";
  cacheKey?: (req: Request, ctx: FnContext<TState>) => string;

  /** @deprecated use cacheKey instead */
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

const isInvokeCtx = <TContext extends ResolverMiddlewareContext<any>>(
  ctx: TContext | TContext & { isInvoke: true },
): ctx is TContext & { isInvoke: true } => {
  return (ctx as TContext & { isInvoke: true })?.isInvoke;
};

export const wrapCaughtErrors = async <
  TConfig = any,
  TContext extends ResolverMiddlewareContext<any> = ResolverMiddlewareContext<
    any
  >,
>(_props: TConfig, ctx: TContext) => {
  if (isInvokeCtx(ctx)) { // invoke should not wrap caught errors.
    return ctx.next!();
  }
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

export const DISABLE_LOADER_CACHE =
  Deno.env.get("DISABLE_LOADER_CACHE") !== undefined;

const stats = {
  cache: meter.createCounter("loader_cache", {
    unit: "1",
    valueType: ValueType.INT,
  }),
  latency: meter.createHistogram("resolver_latency", {
    description: "resolver latency",
    unit: "ms",
    valueType: ValueType.DOUBLE,
  }),
};

let maybeCache: Promise<unknown> | Cache | undefined = caches.open("loader")
  .then((c) => maybeCache = c)
  .catch(() => maybeCache = undefined);

const MAX_AGE_S = 30 * 60; // 30min in seconds

const isCache = (c: any): c is Cache => typeof c?.put === "function";

const inFuture = (maybeDate: string) => {
  try {
    return new Date(maybeDate) > new Date();
  } catch {
    return false;
  }
};

const noop = () => "";

const wrapLoader = ({
  default: handler,
  cache: mode = "no-store",
  cacheKey = noop,
  singleFlightKey,
  ...rest
}: LoaderModule) => {
  const flights = singleFlight();

  if (typeof singleFlightKey === "function") {
    console.warn(
      "singleFlightKey is deprecated and does not work anymore. Please use cacheKey instead",
    );
  }

  return {
    ...rest,
    default: async (
      props: Parameters<typeof handler>[0],
      req: Request,
      ctx: FnContext<unknown, any>,
    ): Promise<ReturnType<typeof handler>> => {
      const loader = ctx.resolverId || "unknown";
      const start = performance.now();
      const skipCache = mode === "no-store" || DISABLE_LOADER_CACHE ||
        !isCache(maybeCache);

      let status: "bypass" | "miss" | "stale" | "hit" | undefined;

      try {
        if (skipCache) {
          status = "bypass";
          stats.cache.add(1, { status, loader });

          return await handler(props, req, ctx);
        }

        // Somehow typescript does not understand maybeCache is Cache
        const cache = maybeCache as Cache;

        // TODO: Resolve props cache key statically
        const key = `${hash(props)}-${cacheKey(req, ctx)}`;
        const request = new Request(
          `https://localhost?propsKey=${hash(props)}&requestKey=${key}`,
        );

        const callHandlerAndCache = async () => {
          const json = await handler(props, req, ctx);

          cache.put(
            request,
            new Response(JSON.stringify(json), {
              headers: {
                "expires": new Date(Date.now() + (MAX_AGE_S * 1e3))
                  .toUTCString(),
              },
            }),
          ).catch(console.error);

          return json;
        };

        const staleWhileRevalidate = async () => {
          const matched = await cache.match(request).catch(() => null);

          if (!matched) {
            status = "miss";
            stats.cache.add(1, { status, loader });

            return await callHandlerAndCache();
          }

          const expires = matched.headers.get("expires");
          const isStale = expires ? !inFuture(expires) : false;

          if (isStale) {
            status = "stale";
            stats.cache.add(1, { status, loader });

            callHandlerAndCache().catch((error) => console.error(error));
          } else {
            status = "hit";
            stats.cache.add(1, { status, loader });
          }

          return await matched.json();
        };

        return await flights.do(key, staleWhileRevalidate);
      } finally {
        const dimension = { loader, status };
        stats.latency.record(performance.now() - start, dimension);
        ctx.monitoring?.currentSpan?.setDesc(status);
      }
    },
  };
};

const loaderBlock: Block<LoaderModule> = {
  type: "loaders",
  introspect: { includeReturn: true },
  adapt: <TProps = any>(mod: LoaderModule<TProps>) => [
    wrapCaughtErrors,
    applyProps(wrapLoader(mod)),
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
