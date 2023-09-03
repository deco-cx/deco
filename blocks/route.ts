// deno-lint-ignore-file no-explicit-any
import { InvocationProxyHandler, newHandler } from "../clients/proxy.ts";
import { METHODS } from "https://deno.land/x/rutt@0.0.13/mod.ts";
import { InvocationFunc } from "../clients/withManifest.ts";
import {
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
import { Resolvable } from "../engine/core/resolver.ts";
import { mapObjKeys } from "../engine/core/utils.ts";
import { HttpError } from "../engine/errors.ts";
import { context as liveContext } from "../live.ts";
import {
  InvocationProxy,
  InvokeFunction,
  payloadForFunc,
} from "../routes/live/invoke/index.ts";
import { setLogger } from "../runtime/fetch/fetchLog.ts";
import { AppManifest, DecoManifest, LiveConfig, LiveState } from "../types.ts";
import { formatIncomingRequest } from "../utils/log.ts";
import { createServerTimings } from "../utils/timings.ts";
import { SourceMap } from "./app.ts";

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

type DebugAction = "enable" | "disable" | "none";
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
  ): { action: DebugAction; enabled: boolean } => {
    const url = new URL(request.url);
    const debugFromCookies = getCookies(request.headers)[DEBUG_COOKIE];
    const debugFromQS = url.searchParams.has(DEBUG_QS) && DEBUG_ENABLED ||
      url.searchParams.get(DEBUG_COOKIE);
    const hasDebugFromQS = debugFromQS !== null;
    const isLivePreview = url.pathname.includes("/live/previews/");
    const enabled = ((debugFromQS ?? debugFromCookies) === DEBUG_ENABLED) ||
      isLivePreview;

    // querystring forces a setcookie using the querystring value
    return {
      action: hasDebugFromQS || isLivePreview
        ? (enabled ? "enable" : "disable")
        : "none",
      enabled,
    };
  },
};

export const buildDecoState = <TManifest extends AppManifest = AppManifest>(
  resolveKey: string | Resolvable,
  sourceMap: SourceMap = {},
) =>
  async function (
    request: Request,
    context: MiddlewareHandlerContext<LiveConfig<any, LiveState, TManifest>>,
  ) {
    context.state.sourceMap ??= sourceMap;
    const { enabled, action } = debug.fromRequest(request);

    if (enabled) {
      const { start, end, printTimings } = createServerTimings();
      context.state.t = { start, end, printTimings };
      context.state.debugEnabled = true;
      context.state.log = console.log;
    } else {
      context.state.log = () => {}; // stub
    }

    // Logs  ?__d is present in localhost
    context.state.log(
      formatIncomingRequest(request, liveContext.site),
    );
    setLogger(context.state.log);

    const url = new URL(request.url);
    const isEchoRoute = url.pathname.startsWith("/live/_echo"); // echoing

    if (isEchoRoute) {
      return new Response(request.body, {
        status: 200,
        headers: request.headers,
      });
    }

    const isLiveMeta = url.pathname.startsWith("/live/_meta"); // live-meta

    const resolver = liveContext.releaseResolver!;
    const ctxResolver = resolver
      .resolverFor(
        { context, request },
        {
          monitoring: { t: context.state.t },
        },
      )
      .bind(resolver);

    if (
      context.destination !== "internal" && context.destination !== "static"
    ) {
      const endTiming = context?.state?.t?.start("load-page");
      const $live = (await ctxResolver(
        resolveKey,
        {
          forceFresh: !isLiveMeta && (
            !liveContext.isDeploy || url.searchParams.has("forceFresh") ||
            url.searchParams.has("pageId") // Force fresh only once per request meaning that only the _middleware will force the fresh to happen the others will reuse the fresh data.
          ),
          nullIfDangling: true,
        },
      )) ?? {};

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
    debug[action](resp);
    setLogger(null);

    return resp;
  };
const mapMiddleware = (
  mid: MiddlewareHandler<LiveConfig<any, LiveState>> | MiddlewareHandler<
    LiveConfig<any, LiveState>
  >[],
): MiddlewareHandler<LiveConfig<any, LiveState>>[] => {
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
        context: HandlerContext<any, LiveConfig<any, LiveState>>,
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
    context: HandlerContext<any, LiveConfig<any, LiveState>>,
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
    context: HandlerContext<any, LiveConfig>,
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
              LiveConfig<any, LiveState>
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
