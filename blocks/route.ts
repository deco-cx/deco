// deno-lint-ignore-file no-explicit-any
import { METHODS } from "https://deno.land/x/rutt@0.0.13/mod.ts";
import { InvocationProxyHandler, newHandler } from "../clients/proxy.ts";
import { InvocationFunc } from "../clients/withManifest.ts";
import {
  context as otelContext,
  FreshHandler as Handler,
  getCookies,
  HandlerContext,
  Handlers,
  MiddlewareHandler,
  MiddlewareHandlerContext,
  MiddlewareModule,
  PageProps,
  RouteConfig,
  RouteModule,
  setCookie,
} from "../deps.ts";
import { Block, BlockModule, ComponentFunc } from "../engine/block.ts";
import { mapObjKeys } from "../engine/core/utils.ts";
import { HttpError } from "../engine/errors.ts";
import { context as liveContext } from "../live.ts";
import { observe } from "../observability/observe.ts";
import { tracer } from "../observability/otel/config.ts";
import {
  REQUEST_CONTEXT_KEY,
  STATE_CONTEXT_KEY,
} from "../observability/otel/context.ts";
import {
  InvocationProxy,
  InvokeFunction,
  payloadForFunc,
} from "../routes/live/invoke/index.ts";
import { setLogger } from "../runtime/fetch/fetchLog.ts";
import {
  AppManifest,
  DecoManifest,
  DecoSiteState,
  DecoState,
} from "../types.ts";
import { formatIncomingRequest } from "../utils/log.ts";
import { createServerTimings } from "../utils/timings.ts";

export interface LiveRouteConfig extends RouteConfig {
  liveKey?: string;
}

export interface LiveRouteModule extends RouteModule {
  config?: LiveRouteConfig;
}

type HandlerLike = Handler<any, any> | Handlers<any, any>;
type ConfigurableRoute = {
  handler?: HandlerLike;
  config: LiveRouteConfig;
};

/**
 * Wraps any route with an error handler that catches http-errors and returns the response accordingly.
 * Additionally logs the exception when running in a deployment.
 *
 * Ideally, this should be placed inside the `_middleware.ts` but fresh handles exceptions and wraps it into a 500-response before being catched by the middleware.
 * See more at: https://github.com/denoland/fresh/issues/586
 */
const withErrorHandler = (
  routePath: string,
  handler: Handler<any, any>,
): Handler<any, any> => {
  return async (req: Request, ctx: HandlerContext<any>) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) {
        return err.resp;
      }
      console.error("an error has occurred", routePath, err);
      throw err;
    }
  };
};
const hasAnyMethod = (obj: Record<string, any>): boolean => {
  for (const method of METHODS) {
    if (obj[method]) {
      return true;
    }
  }
  return false;
};

const isConfigurableRoute = (
  v: DecoManifest["routes"][string] | ConfigurableRoute,
): v is ConfigurableRoute => {
  const handler = (v as RouteModule).handler;
  const defaultIsFunc = typeof (v as RouteModule).default === "function";
  const handlerIsFunc = typeof handler === "function";

  const handlerIsFuncMap = handler !== undefined &&
    typeof handler === "object" &&
    hasAnyMethod(handler);

  return (
    handlerIsFunc || defaultIsFunc || handlerIsFuncMap
  );
};
const middlewareKey = "./routes/_middleware.ts";
/**
 * Unfortunately fresh does not accept one route for catching all non-matched routes.
 * It can be done using routeOverride (/*) but the internal fresh sort will break and this route will not be properly sorted.
 * So we're replicating the same handler for index.tsx as well, as a consequence of that, we need to manually convert the route name to [...catchall].tsx to avoid having two different configurations for each.
 */
const indexTsxToCatchAll: Record<string, string> = {
  "/index": "./routes/[...catchall].tsx",
  "/[...catchall]": "./routes/[...catchall].tsx",
  "./routes/index.tsx": "./routes/[...catchall].tsx",
};
const addHours = function (date: Date, h: number) {
  date.setTime(date.getTime() + (h * 60 * 60 * 1000));
  return date;
};

const DEBUG_COOKIE = "__dcxf_debug";
const DEBUG_ENABLED = "enabled";

const DEBUG_QS = "__d";

type DebugAction = (resp: Response) => void;
const debug = {
  none: (_resp: Response) => {},
  enable: (resp: Response) => {
    setCookie(resp.headers, {
      name: DEBUG_COOKIE,
      value: DEBUG_ENABLED,
      expires: addHours(new Date(), 1),
    });
  },
  disable: (resp: Response) => {
    setCookie(resp.headers, {
      name: DEBUG_COOKIE,
      value: "",
      expires: new Date("Thu, 01 Jan 1970 00:00:00 UTC"),
    });
  },
  fromRequest: (
    request: Request,
  ): { action: DebugAction; enabled: boolean; correlationId: string } => {
    const url = new URL(request.url);
    const debugFromCookies = getCookies(request.headers)[DEBUG_COOKIE];
    const debugFromQS = url.searchParams.has(DEBUG_QS) && DEBUG_ENABLED ||
      url.searchParams.get(DEBUG_COOKIE);
    const hasDebugFromQS = debugFromQS !== null;
    const isLivePreview = url.pathname.includes("/live/previews/");
    const enabled = ((debugFromQS ?? debugFromCookies) === DEBUG_ENABLED) ||
      isLivePreview;

    const correlationId = url.searchParams.get(DEBUG_QS) || crypto.randomUUID();
    // querystring forces a setcookie using the querystring value
    return {
      action: hasDebugFromQS || isLivePreview
        ? (enabled
          ? (resp) => {
            debug["enable"](resp);
            resp.headers.set("x-correlation-id", correlationId);
            resp.headers.set("x-deno-os-uptime-seconds", `${Deno.osUptime()}`);
            resp.headers.set(
              "x-isolate-started-at",
              `${liveContext.instance.startedAt.toISOString()}`,
            );
            liveContext.instance.readyAt &&
              resp.headers.set(
                "x-isolate-ready-at",
                `${liveContext.instance.readyAt.toISOString()}`,
              );
          }
          : debug["disable"])
        : debug["none"],
      enabled,
      correlationId,
    };
  },
};

export const buildDecoState = <TManifest extends AppManifest = AppManifest>(
  resolveKeyOrInstallPromise: string | Promise<unknown>,
) =>
  async function (
    request: Request,
    context: MiddlewareHandlerContext<DecoState<any, DecoSiteState, TManifest>>,
  ) {
    const { enabled, action, correlationId } = debug.fromRequest(request);

    const t = createServerTimings();
    if (enabled) {
      context.state.t = t;
      context.state.debugEnabled = true;
      context.state.correlationId = correlationId;
    }

    context.state.monitoring = {
      timings: t,
      metrics: observe,
      tracer,
      context: otelContext.active().setValue(REQUEST_CONTEXT_KEY, request)
        .setValue(
          STATE_CONTEXT_KEY,
          context.state,
        ),
      logger: enabled ? console : {
        ...console,
        log: () => {},
        error: () => {},
        debug: () => {},
        info: () => {},
      },
    };

    // Logs  ?__d is present in localhost
    context.state.monitoring.logger.log(
      formatIncomingRequest(request, liveContext.site),
    );
    setLogger(context.state.monitoring.logger.log);

    const url = new URL(request.url);
    const isEchoRoute = url.pathname.startsWith("/live/_echo"); // echoing

    if (isEchoRoute) {
      return new Response(request.body, {
        status: 200,
        headers: request.headers,
      });
    }

    if (!liveContext.runtime) {
      console.error(
        "live runtime is not present, the apps were properly installed?",
      );
      return context.next();
    }

    const isLiveMeta = url.pathname.startsWith("/live/_meta"); // live-meta
    const { resolver } = await liveContext.runtime;
    const ctxResolver = resolver
      .resolverFor(
        { context, request },
        {
          monitoring: context.state.monitoring,
        },
      )
      .bind(resolver);

    if (
      context.destination !== "internal" && context.destination !== "static"
    ) {
      const endTiming = context?.state?.t?.start("load-page");
      const $live = typeof resolveKeyOrInstallPromise === "string"
        ? (await ctxResolver(
          resolveKeyOrInstallPromise,
          {
            forceFresh: !isLiveMeta && (
              !liveContext.isDeploy || url.searchParams.has("forceFresh") ||
              url.searchParams.has("pageId") // Force fresh only once per request meaning that only the _middleware will force the fresh to happen the others will reuse the fresh data.
            ),
            nullIfDangling: true,
          },
        )) ?? {}
        : await resolveKeyOrInstallPromise.then(() => ({}));

      endTiming?.();
      context.state.$live = $live;
    }

    context.state.resolve = ctxResolver;
    context.state.release = liveContext.release!;
    const invoker = (
      key: string,
      props: unknown,
    ) =>
      ctxResolver<Awaited<ReturnType<InvocationFunc<TManifest>>>>(
        payloadForFunc({ key, props } as InvokeFunction<TManifest>),
      );

    context.state.invoke = new Proxy<InvocationProxyHandler>(
      invoker as InvocationProxyHandler,
      newHandler<TManifest>(invoker),
    ) as unknown as
      & InvocationProxy<
        TManifest
      >
      & InvocationFunc<TManifest>;

    const resp = await context.next();
    // enable or disable debugging
    if (request.headers.get("upgrade") === "websocket") {
      return resp;
    }
    action(resp);
    setLogger(null);

    return resp;
  };
const mapMiddleware = (
  mid: MiddlewareHandler<DecoState<any, DecoSiteState>> | MiddlewareHandler<
    DecoState<any, DecoSiteState>
  >[],
): MiddlewareHandler<DecoState<any, DecoSiteState>>[] => {
  return [buildDecoState(middlewareKey), ...Array.isArray(mid) ? mid : [mid]];
};

export const injectLiveStateForPath = (
  path: string,
  handlers: Handler<any, any> | Handlers<any, any> | undefined,
): Handler<any, any> | Handlers<any, any> => {
  if (typeof handlers === "object") {
    return mapObjKeys(handlers, (val) => {
      return withErrorHandler(path, async function (
        request: Request,
        context: HandlerContext<any, DecoState<any, DecoSiteState>>,
      ) {
        const $live = await context?.state?.resolve?.(
          indexTsxToCatchAll[path] ?? path,
          { nullIfDangling: true },
        ); // middleware should be executed first.
        context.state.$live = $live;

        return val!(request, context);
      });
    });
  }
  return withErrorHandler(path, async function (
    request: Request,
    context: HandlerContext<any, DecoState<any, DecoSiteState>>,
  ) {
    const $live = (await context?.state?.resolve?.(
      indexTsxToCatchAll[path] ?? path,
      { nullIfDangling: true },
    )) ?? {};

    if (typeof handlers === "function") {
      context.state.$live = $live;

      return await handlers(request, context);
    }
    return await context.render($live);
  });
};
export type Route<TProps = any> = ComponentFunc<PageProps<TProps>>;

export interface RouteMod extends BlockModule {
  handler?: (
    request: Request,
    context: HandlerContext<any, DecoState>,
  ) => Promise<Response>;
  default: Route;
}

const blockType = "routes";
const routeBlock: Block<RouteMod> = {
  decorate: (routeModule, key) => {
    if (key === middlewareKey) {
      return {
        ...routeModule,
        handler: mapMiddleware(
          (routeModule as unknown as MiddlewareModule)
            .handler as MiddlewareHandler<
              DecoState<any, DecoSiteState>
            >,
        ),
      };
    }
    if (key.endsWith("_middleware.ts")) {
      return routeModule;
    }

    if (
      isConfigurableRoute(routeModule)
    ) {
      const configurableRoute = routeModule;
      const handl = configurableRoute.handler;
      const liveKey = configurableRoute.config?.liveKey ?? key;
      return {
        ...routeModule,
        handler: injectLiveStateForPath(liveKey, handl),
      };
    }
    return routeModule;
  },
  type: blockType,
};

export default routeBlock;
