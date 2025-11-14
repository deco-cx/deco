// deno-lint-ignore-file no-explicit-any
import JsonViewer from "../components/JsonViewer.tsx";
import { RequestContext } from "../deco.ts";
import { ValueType } from "../deps.ts";
import type { Block, BlockModule, InstanceOf } from "../engine/block.ts";
import { FieldResolver } from "../engine/core/resolver.ts";
import { singleFlight } from "../engine/core/utils.ts";
import type { DecofileProvider } from "../engine/decofile/provider.ts";
import { HttpError } from "../engine/errors.ts";
import type { ResolverMiddlewareContext } from "../engine/middleware.ts";
import type { State } from "../mod.ts";
import { logger } from "../observability/otel/config.ts";
import {
  meter,
  OTEL_ENABLE_EXTRA_METRICS,
} from "../observability/otel/metrics.ts";
import { caches, ENABLE_LOADER_CACHE } from "../runtime/caches/mod.ts";
import { inFuture } from "../runtime/caches/utils.ts";
import type { DebugProperties } from "../utils/vary.ts";
import type { HttpContext } from "./handler.ts";
import {
  applyProps,
  type FnContext,
  type FnProps,
  gateKeeper,
  type GateKeeperAccess,
  type RequestState,
  type SingleFlightKeyFunc,
} from "./utils.tsx";

export type Loader = InstanceOf<typeof loaderBlock, "#/root/loaders">;

type CacheMode = "no-store" | "no-cache" | "stale-while-revalidate";

export interface LoaderModule<
  TProps = any,
  TState = any,
> extends BlockModule<FnProps<TProps>>, GateKeeperAccess {
  /**
   * Specifies caching behavior for the loader and its dependencies.
   *
   * - **no-store**:
   *   - Completely bypasses the cache, ensuring that the loader always runs and fetches fresh data.
   *   - This setting also changes `ctx.vary.shouldCache` to `false`, which prevents other dependent sections from being cached.
   *   - The `vary` is not set, even if the loader has a cache key.
   *
   * - **no-cache**:
   *   - Ignores the cache for the current loader run, but does not affect the caching behavior of other dependent blocks.
   *   - This is useful for loaders that should always execute but whose results can still be cached.
   *
   * - **stale-while-revalidate**:
   *   - If no data exists for a cache key, the loader runs, and the fresh data is returned.
   *   - If stale data is available, it is returned immediately while the loader runs in the background to revalidate and update the cache if the data is outdated.
   *
   * @default "no-store"
   */
  cache?: CacheMode | {
    maxAge: number;
  };
  // a null value avoid cache
  cacheKey?: (
    props: TProps,
    req: Request,
    ctx: FnContext<TState>,
  ) => string | null;

  /** @deprecated use cacheKey instead */
  singleFlightKey?: SingleFlightKeyFunc<TProps, HttpContext>;
}

interface LoaderDebugData extends DebugProperties {
  reason: {
    cache: NonNullable<CacheMode>;
    cacheKeyNull: boolean;
  };
}

export interface WrappedError {
  __isErr: true;
}
export const isWrappedError = (
  err: any | WrappedError,
): err is WrappedError => {
  return (err as WrappedError)?.__isErr;
};

export const isInvokeCtx = <TContext extends ResolverMiddlewareContext<any>>(
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
    if (err instanceof HttpError) {
      throw err;
    }
    return new Proxy({}, {
      get: (_target, prop) => {
        if (prop === "then") {
          return undefined;
        }
        if (prop === "__isErr") {
          return true;
        }

        /**
         * This proxy may be used inside islands.
         * Islands props are serialized by fresh's serializer.
         * This code makes it behave well with fresh's serializer
         */
        if (prop === "peek") {
          return undefined;
        }
        if (prop === "toJSON") {
          return () => null;
        }

        /**
         * No special case found, throw and hope to be caught by the
         * section's ErrorFallback
         */
        throw err;
      },
    });
  }
};

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

let maybeCache: Cache | undefined;

caches?.open("loader")
  .then((c) => maybeCache = c)
  .catch(() => maybeCache = undefined);

const MAX_AGE_S = parseInt(Deno.env.get("CACHE_MAX_AGE_S") ?? "60"); // 60 seconds

// Reuse TextEncoder instance to avoid repeated instantiation
const textEncoder = new TextEncoder();

const isCache = (c: Cache | undefined): c is Cache => typeof c !== "undefined";

const noop = () => "";

/**
 * Wraps the loader written by the user by adding support for:
 * 1. Caching
 * 2. Single Flight
 * 3. Tracing
 *
 * Performance optimizations applied:
 * - Reused TextEncoder instance to avoid repeated instantiation
 * - Optimized cache key generation using string concatenation
 * - Improved string concatenation for Content-Length header
 */
const wrapLoader = (
  {
    default: handler,
    cache = "no-store",
    cacheKey = noop,
    singleFlightKey,
    ...rest
  }: LoaderModule,
  resolveChain: FieldResolver[],
  release: DecofileProvider,
) => {
  const [cacheMaxAge, mode] = typeof cache === "string"
    ? [MAX_AGE_S, cache]
    : [cache?.maxAge, "stale-while-revalidate"];
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
      ctx: FnContext<State, any>,
    ): Promise<ReturnType<typeof handler>> => {
      const loader = ctx.resolverId || "unknown";
      const start = performance.now();
      let status: "bypass" | "miss" | "stale" | "hit" | undefined;

      const isCacheEngineDefined = isCache(maybeCache);
      const isCacheDisabled = !ENABLE_LOADER_CACHE ||
        !isCacheEngineDefined;

      const cacheKeyValue = cacheKey(props, req, ctx);
      const isCacheKeyNull = cacheKeyValue === null;
      const isCacheNoStore = mode === "no-store";
      const isCacheNoCache = mode === "no-cache";

      const bypassCache = isCacheNoStore || isCacheNoCache ||
        isCacheKeyNull || isCacheDisabled;

      try {
        // Should skip cache
        if (
          bypassCache ||
          // This code is unreachable, but the TS complains that cache is undefined because
          // it doesn't get that isCache is inside the bypassCache variable
          !isCache(maybeCache)
        ) {
          const shouldNotCache = isCacheNoStore || isCacheKeyNull;

          if (ctx.vary && shouldNotCache) {
            ctx.vary.shouldCache = false;

            if (ctx.debugEnabled) {
              const resolver = resolveChain.at(-1);
              resolver &&
                ctx.vary.debug.push<LoaderDebugData>({
                  resolver,
                  reason: {
                    cache: mode as CacheMode,
                    cacheKeyNull: isCacheKeyNull,
                  },
                });
            }
          }
          !shouldNotCache && ctx.vary?.push(cacheKeyValue);

          status = "bypass";
          stats.cache.add(1, { status, loader });

          RequestContext?.signal?.throwIfAborted();
          return await handler(props, req, ctx);
        }

        ctx.vary?.push(loader, cacheKeyValue);
        RequestContext?.signal?.throwIfAborted();

        const cache = maybeCache;

        const timing = ctx.monitoring?.timings.start("loader-hash");

        const resolveChainString = FieldResolver.minify(resolveChain)
          .toString();
        const revisionID = await release?.revision() ?? undefined;

        if (!resolveChainString || !revisionID) {
          if (!resolveChainString && !revisionID) {
            logger.warn(`Could not get revisionID nor resolveChain`);
          }
          if (!revisionID) {
            logger.warn(
              `Could not get revisionID for resolveChain ${resolveChainString}`,
            );
          }
          if (!resolveChainString) {
            logger.warn(
              `Could not get resolveChain for revisionID ${revisionID}`,
            );
          }

          timing?.end();
          return await handler(props, req, ctx);
        }

        timing?.end();

        // Optimize cache key generation using simple string concatenation
        const cacheKeyUrl = `https://localhost/?resolver=${
          encodeURIComponent(loader)
        }&resolveChain=${encodeURIComponent(resolveChainString)}&revisionID=${
          encodeURIComponent(revisionID)
        }&cacheKey=${encodeURIComponent(cacheKeyValue)}`;
        const request = new Request(cacheKeyUrl);

        const callHandlerAndCache = async () => {
          const json = await handler(props, req, ctx);

          // Optimize JSON serialization and encoding using reused TextEncoder
          const jsonString = JSON.stringify(json);
          const jsonStringEncoded = textEncoder.encode(jsonString);

          const headers: { [key: string]: string } = {
            expires: new Date(Date.now() + (cacheMaxAge * 1e3)).toUTCString(),
            "Content-Type": "application/json",
          };

          if (jsonStringEncoded.length > 0) {
            headers["Content-Length"] = jsonStringEncoded.length.toString();
          }

          cache.put(
            request,
            new Response(jsonStringEncoded, {
              headers: headers,
            }),
          ).catch((error) =>
            logger.error(`loader error ${error}`, {
              loader,
              cacheKey: cacheKeyValue,
              error: {
                message: error.message,
                stack: error.stack,
              },
            })
          );

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

            callHandlerAndCache().catch((error) =>
              logger.error(`loader error ${error}`, {
                loader,
                cacheKey: cacheKeyValue,
                error: {
                  message: error.message,
                  stack: error.stack,
                },
              })
            );
          } else {
            status = "hit";
            stats.cache.add(1, { status, loader });
          }

          return await matched.json();
        };

        return await flights.do(request.url, staleWhileRevalidate);
      } finally {
        const dimension = { loader, status };
        if (OTEL_ENABLE_EXTRA_METRICS) {
          stats.latency.record(performance.now() - start, dimension);
        }
        ctx.monitoring?.currentSpan?.setDesc(status);
      }
    },
  };
};

const loaderBlock: Block<LoaderModule> = {
  type: "loaders",
  introspect: { includeReturn: true },
  adapt: <TProps = any>(mod: LoaderModule<TProps>, key: string) => [
    gateKeeper(mod.defaultVisibility, key),
    wrapCaughtErrors,
    (props: TProps, ctx: HttpContext<{ global: any } & RequestState>) =>
      applyProps(
        wrapLoader(mod, ctx.resolveChain, ctx.context.state.release),
      )(
        props,
        ctx,
      ),
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
