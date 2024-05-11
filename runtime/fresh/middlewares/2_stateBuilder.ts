// deno-lint-ignore-file no-explicit-any
import { Context } from "../../../deco.ts";
import {
  context as otelContext,
  type FreshHandler as Handler,
  getCookies,
  type HandlerContext,
  type Handlers,
  type MiddlewareHandlerContext,
  type RouteConfig,
  type RouteModule,
  setCookie,
} from "../../../deps.ts";
import { mapObjKeys } from "../../../engine/core/utils.ts";
import { HttpError } from "../../../engine/errors.ts";
import { observe } from "../../../observability/observe.ts";
import { logger, tracer } from "../../../observability/otel/config.ts";
import {
  REQUEST_CONTEXT_KEY,
  STATE_CONTEXT_KEY,
} from "../../../observability/otel/context.ts";
import type { AppManifest, DecoSiteState, DecoState } from "../../../types.ts";
import { forceHttps } from "../../../utils/http.ts";
import { buildInvokeFunc } from "../../../utils/invoke.server.ts";
import { createServerTimings } from "../../../utils/timings.ts";
import { setLogger } from "../../fetch/fetchLog.ts";

export interface LiveRouteConfig extends RouteConfig {
  liveKey?: string;
}

export interface LiveRouteModule extends RouteModule {
  config?: LiveRouteConfig;
}

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
      console.error(`route error ${routePath}: ${err}`);
      logger.error(`route ${routePath}: ${err?.stack}`);
      throw err;
    }
  };
};

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

const DEBUG_COOKIE = "deco_debug";
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
    const liveContext = Context.active();
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
  resolveKey?: string,
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
    if (enabled) {
      setLogger(context.state.monitoring.logger.log);
    }

    const url = new URL(request.url);
    const isEchoRoute = url.pathname.startsWith("/live/_echo"); // echoing

    if (isEchoRoute) {
      return new Response(request.body, {
        status: 200,
        headers: request.headers,
      });
    }

    const liveContext = Context.active();
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
        { context, request: forceHttps(request) },
        {
          monitoring: context.state.monitoring,
        },
      )
      .bind(resolver);

    if (
      (context.destination !== "internal" &&
        context.destination !== "static") && resolveKey
    ) {
      const timing = context?.state?.t?.start("load-page");
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

      timing?.end();
      context.state.$live = $live;
    }

    context.state.resolve = ctxResolver;
    context.state.release = liveContext.release!;

    context.state.invoke = buildInvokeFunc<TManifest>(ctxResolver, {}, {
      isInvoke: true,
    });

    const resp = await context.next();
    // enable or disable debugging
    if (request.headers.get("upgrade") === "websocket") {
      return resp;
    }
    action(resp);
    setLogger(null);

    return resp;
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
