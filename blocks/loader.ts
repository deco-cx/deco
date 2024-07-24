// deno-lint-ignore-file no-explicit-any
import JsonViewer from "../components/JsonViewer.tsx";
import { LoggerProvider, ValueType, weakcache } from "../deps.ts";
import type { Block, BlockModule, InstanceOf } from "../engine/block.ts";
import { FieldResolver } from "../engine/core/resolver.ts";
import { singleFlight } from "../engine/core/utils.ts";
import type { DecofileProvider } from "../engine/decofile/provider.ts";
import { HttpError } from "../engine/errors.ts";
import type { ResolverMiddlewareContext } from "../engine/middleware.ts";
import { logger } from "../observability/otel/config.ts";
import { meter } from "../observability/otel/metrics.ts";
import { caches, ENABLE_LOADER_CACHE } from "../runtime/caches/mod.ts";
import type { HttpContext } from "./handler.ts";
import {
  applyProps,
  type FnContext,
  type FnProps,
  type RequestState,
  type SingleFlightKeyFunc,
} from "./utils.tsx";

export type Loader = InstanceOf<typeof loaderBlock, "#/root/loaders">;

export interface LoaderModule<
  TProps = any,
  TState = any,
> extends BlockModule<FnProps<TProps>> {
  cache?: "no-store" | "stale-while-revalidate";
  // a null value avoid cache
  cacheKey?: (
    props: TProps,
    req: Request,
    ctx: FnContext<TState>,
  ) => string | null;

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
    return await ctx.next!(); // Seems like here
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
         * No special case found, throw and hope to be catch by the
         * section's ErrorFallback
         */
        throw err;
      },
    });
  }
};

export const LOADER_CACHE_START_TRESHOLD =
  Deno.env.get("LOADER_CACHE_START_TRESHOLD") ?? 0;

export const LOADER_CACHE_SIZE = Deno.env.get("LOADER_CACHE_SIZE") ?? 1_024_000;

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

const isCache = (c: Cache | undefined): c is Cache => typeof c !== "undefined";

const inFuture = (maybeDate: string) => {
  try {
    return new Date(maybeDate) > new Date();
  } catch {
    return false;
  }
};

const noop = () => "";

let countCache = null as (weakcache.WeakLRUCache | null);

/**
 * Wraps the loader written by the user by adding support for:
 * 1. Caching
 * 2. Single Flight
 * 3. Tracing
 */
const wrapLoader = (
  {
    default: handler,
    cache: mode = "no-store",
    cacheKey = noop,
    singleFlightKey,
    ...rest
  }: LoaderModule,
  resolveChain: FieldResolver[],
  release: DecofileProvider,
) => {
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
      let status: "bypass" | "miss" | "stale" | "hit" | undefined;
      const cacheKeyValue = cacheKey(props, req, ctx);
      console.log("loader.ts cacheKeyValue: ", cacheKeyValue, " props: ", props, " req: ", req);
      try {
        // Should skip cache
        if (
          mode === "no-store" ||
          !ENABLE_LOADER_CACHE ||
          !isCache(maybeCache) ||
          cacheKeyValue === null
        ) {
          console.log("bypassed the cache, cacheKeyValue: ", cacheKeyValue, " mode: ", mode, " ENABLE_LOADER_CACHE: ", ENABLE_LOADER_CACHE, " isCache(maybeCache): ", isCache(maybeCache));
          status = "bypass";
          stats.cache.add(1, { status, loader });

          return await handler(props, req, ctx);
        }

        ctx.vary && ctx.vary.push(loader, cacheKeyValue);
        if (countCache === null) {
          countCache = new weakcache.WeakLRUCache({
            cacheSize: LOADER_CACHE_SIZE,
          });
        }

        const cc = countCache.get(cacheKeyValue) ?? { count: 0 };

        if (cc.count === 0) {
          cc.count = 1;
          countCache.set(cacheKeyValue, cc);
        } else {
          cc.count += 1;
        }

        if (cc.count < LOADER_CACHE_START_TRESHOLD) {
          status = "bypass";
          stats.cache.add(1, { status, loader });

          return await handler(props, req, ctx);
        }

        const cache = maybeCache;

        const timing = ctx.monitoring?.timings.start("loader-hash");
        // Web Cache API requires a request. Create an artificial request with the right key
        // TODO: (@tlgimenes) Resolve props cache key statically
        const url = new URL("https://localhost");
        url.searchParams.set("resolver", loader);

        const resolveChainString = FieldResolver.minify(resolveChain)
          .toString();
        const revisionID = await release?.revision() ?? undefined;

        if (resolveChainString && revisionID) {
          url.searchParams.set("resolveChain", resolveChainString);
          url.searchParams.set("revisionID", revisionID);
        } else {
          if (!resolveChainString && !revisionID) {
            logger.warning(`Could not get revisionID nor resolveChain`);
          }
          if (!revisionID) {
            logger.warning(
              `Could not get revisionID for resolveChain ${resolveChainString}`,
            );
          }
          if (!resolveChainString) {
            logger.warning(
              `Could not get resolveChain for revisionID ${revisionID}`,
            );
          }

          timing?.end();
          return await handler(props, req, ctx);
        }

        timing?.end();
        url.searchParams.set("cacheKey", cacheKeyValue);
        const request = new Request(url);

        const callHandlerAndCache = async () => {
          let json;
          try {
            json = await handler(props, req, ctx); // aqui tá rolando o erro
            json = JSON.stringify(json);
          } catch (error) {
            console.log("ERROR -> handler error: ", error);
          }
          console.log("Length of json in call handler and cache: ", json ? json.length : 0);
          const response = new Response(json, {
            headers: {
              "expires": new Date(Date.now() + (MAX_AGE_S * 1e3))
                .toUTCString(),
              "Content-Length": json.length.toString(),
            },
          });
          console.log(
            "caching the following request: ",
            request,
            "\nAnd response: ",
            response,
            "Request headers: ", request.headers,
          );
          cache.put(
            request,
            response,
          ).catch((error) => {
            console.log(
              "ERROR -> request",
              request,
              "\nAnd response: ",
              response,
              " -- callhandlerandcache",
            );
            console.error(
              `ERROR -> loader error ${error} -- callhandlerandcache`,
            );
          });

          return json;
        };

        const staleWhileRevalidate = async () => {
          const matched = await cache.match(request).catch(() => null);
          console.log(`matched: ${matched}`);
          if (!matched) {
            status = "miss";
            stats.cache.add(1, { status, loader });

            return await callHandlerAndCache();
          }
          console.log("matched headers: ", matched.headers);
          const expires = matched.headers.get("expires");
          const isStale = expires ? !inFuture(expires) : false;

          if (isStale) {
            status = "stale";
            stats.cache.add(1, { status, loader });

            callHandlerAndCache();
          } else {
            status = "hit";
            stats.cache.add(1, { status, loader });
          }
          const matchedJson = matched.json();
          console.log("matchedJson: ", matchedJson);
          return await matchedJson;
        };

        return await flights.do(request.url, staleWhileRevalidate);
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
    (props: TProps, ctx: HttpContext<{ global: any } & RequestState>) =>
      applyProps(wrapLoader(mod, ctx.resolveChain, ctx.context.state.release))(
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
