// deno-lint-ignore-file no-explicit-any
import { DECO_MATCHER_HEADER_QS } from "../blocks/matcher.ts";
import { Context } from "../deco.ts";
import { getCookies, SpanStatusCode } from "../deps.ts";
import { type AppManifest, DECO_SEGMENT, HttpError, logger } from "../mod.ts";
import { startObserve } from "../observability/http.ts";
import { isAdminOrLocalhost } from "../utils/admin.ts";
import { decodeCookie, setCookie } from "../utils/cookies.ts";
import { allowCorsFor } from "../utils/http.ts";
import { formatLog } from "../utils/log.ts";
import { tryOrDefault } from "../utils/object.ts";
import type { Deco, State } from "./app.ts";
import type {
  ContextRenderer,
  Handler,
  Context as HonoContext,
  Input,
  MiddlewareHandler,
} from "./deps.ts";
import { setLogger } from "./fetch/fetchLog.ts";

export const proxyState = (
  ctx: DecoMiddlewareContext & { params?: Record<string, string> },
) => {
  const ctxSetter = {
    set(_: any, prop: any, newValue: any) {
      ctx.set(prop, newValue);
      return true;
    },
    get: (val: any, prop: any, recv: any) => Reflect.get(val, prop, recv),
  };
  return {
    ...ctx,
    params: ctx.params ?? ctx.req.param(),
    get state() {
      return new Proxy(ctx.var, ctxSetter);
    },
  };
};

export type DecoMiddleware<TManifest extends AppManifest = AppManifest> =
  MiddlewareHandler<
    DecoRouteState<TManifest>
  >;

export type DecoRouteState<TManifest extends AppManifest = AppManifest> = {
  Variables: State<TManifest>;
  Bindings: {
    renderFn?: ContextRenderer
  };
};
export type DecoHandler<TManifest extends AppManifest = AppManifest> = Handler<
  DecoRouteState<TManifest>
>;

export type DecoMiddlewareContext<
  TManifest extends AppManifest = AppManifest,
  P extends string = any,
  // deno-lint-ignore ban-types
  I extends Input = {},
> = HonoContext<DecoRouteState<TManifest>, P, I>;

export const createHandler = <TManifest extends AppManifest = AppManifest>(
  handler: DecoHandler<TManifest>,
): DecoHandler<TManifest> =>
async (ctx, next) => {
  try {
    return await handler(ctx, next);
  } catch (err) {
    if (err instanceof HttpError) {
      return err.resp;
    }
    console.error(`route error ${ctx.req.routePath}: ${err}`);
    logger.error(`route ${ctx.req.routePath}: ${err?.stack}`);
    throw err;
  }
};

const DEBUG_COOKIE = "deco_debug";
const DEBUG_ENABLED = "enabled";

const DEBUG_QS = "__d";
const addHours = function (date: Date, h: number) {
  date.setTime(date.getTime() + (h * 60 * 60 * 1000));
  return date;
};

export type DebugAction = (resp: Response) => void;
export const DEBUG = {
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

    const correlationId = url.searchParams.get(DEBUG_QS) ||
      crypto.randomUUID();
    const liveContext = Context.active();
    // querystring forces a setcookie using the querystring value
    return {
      action: hasDebugFromQS || isLivePreview
        ? (enabled
          ? (resp) => {
            DEBUG.enable(resp);
            resp.headers.set("x-correlation-id", correlationId);
            resp.headers.set(
              "x-deno-os-uptime-seconds",
              `${Deno.osUptime()}`,
            );
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
          : DEBUG.disable)
        : DEBUG.none,
      enabled,
      correlationId,
    };
  },
};

const wellKnownMonitoringRobotsUA = [
  "Mozilla/5.0 (compatible; monitoring360bot/1.1; +http://www.monitoring360.io/bot.html)",
  "Mozilla/5.0+(compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)",
];

const isMonitoringRobots = (req: Request) => {
  const ua = req.headers.get("user-agent");
  if (!ua) {
    return false;
  }
  return wellKnownMonitoringRobotsUA.some((robot) => ua.includes(robot));
};

export const middlewareFor = <TAppManifest extends AppManifest = AppManifest>(
  deco: Deco<TAppManifest>,
): DecoMiddleware<TAppManifest>[] => {
  return [
    // 1 => statebuilder
    async (ctx, next) => {
      const { enabled, action, correlationId } = DEBUG.fromRequest(
        ctx.req.raw,
      );

      const state = await deco.prepareState(
        ctx,
        {
          enabled,
          correlationId,
        },
      );
      for (const [key, value] of Object.entries(state)) {
        ctx.set(key as keyof typeof state, value);
      }

      const url = new URL(ctx.req.raw.url);
      const isEchoRoute = url.pathname.startsWith("/live/_echo"); // echoing

      if (isEchoRoute) {
        return new Response(ctx.req.raw.body, {
          status: 200,
          headers: ctx.req.raw.headers,
        });
      }

      await next();
      // enable or disable debugging
      if (ctx.req.raw.headers.get("upgrade") === "websocket") {
        return;
      }
      ctx.res && action(ctx.res);
      setLogger(null);
    },
    // 2 => observability
    async (ctx, next) => {
      const url = new URL(ctx.req.raw.url); // TODO(mcandeia) check if ctx.url can be used here
      const context = Context.active();
      ctx.res = await ctx.var.monitoring.tracer.startActiveSpan(
        "./routes/_middleware.ts",
        {
          attributes: {
            "deco.site.name": context.site,
            "http.request.url": ctx.req.raw.url,
            "http.request.method": ctx.req.raw.method,
            "http.request.body.size":
              ctx.req.raw.headers.get("content-length") ??
                undefined,
            "url.scheme": url.protocol,
            "server.address": url.host,
            "url.query": url.search,
            "url.path": url.pathname,
            "user_agent.original": ctx.req.raw.headers.get("user-agent") ??
              undefined,
          },
        },
        ctx.var.monitoring.context,
        async (span) => {
          ctx.var.monitoring.rootSpan = span;

          const begin = performance.now();
          const end = startObserve();
          let response: Response | null = null;
          try {
            await next();
            return (response = ctx.res!);
          } catch (e) {
            span.recordException(e);
            throw e;
          } finally {
            const status = response?.status ?? 500;
            const isErr = status >= 500;
            span.setStatus({
              code: isErr ? SpanStatusCode.ERROR : SpanStatusCode.OK,
            });
            span.setAttribute(
              "http.response.status_code",
              `${status}`,
            );
            if (ctx?.var?.pathTemplate) {
              const route = `${ctx.req.raw.method} ${ctx?.var?.pathTemplate}`;
              span.updateName(route);
              span.setAttribute("http.route", route);
              end?.(
                ctx.req.raw.method,
                ctx?.var?.pathTemplate,
                response?.status ?? 500,
              );
            } else {
              span.updateName(
                `${ctx.req.raw.method} ${ctx.req.raw.url}`,
              );
            }
            span.end();
            if (!url.pathname.startsWith("/_frsh")) {
              console.info(
                formatLog({
                  status: response?.status ?? 500,
                  url,
                  begin,
                  timings: ctx.var.debugEnabled
                    ? ctx.var.monitoring.timings.get()
                    : undefined,
                }),
              );
            }
          }
        },
      );
    },
    // 3 => main
    async (ctx, next) => {
      if (
        ctx.req.raw.method === "HEAD" && isMonitoringRobots(ctx.req.raw)
      ) {
        ctx.res = new Response(null, { status: 200 });
        return;
      }

      const url = new URL(ctx.req.raw.url); // TODO(mcandeia) check if ctx.url can be used here

      const shouldAllowCorsForOptions = ctx.req.raw.method === "OPTIONS" &&
        isAdminOrLocalhost(ctx.req.raw);

      const initialResponse = shouldAllowCorsForOptions
        ? new Response()
        : await next().then(() => ctx.res!);

      // Let rendering occur — handlers are responsible for calling ctx.var.loadPage
      if (ctx.req.raw.headers.get("upgrade") === "websocket") {
        ctx.res = initialResponse;
        return;
      }
      const newHeaders = new Headers(initialResponse.headers);
      if (
        (url.pathname.startsWith("/live/previews") &&
          url.searchParams.has("mode") &&
          url.searchParams.get("mode") == "showcase") ||
        url.pathname.startsWith("/_frsh/") ||
        shouldAllowCorsForOptions
      ) {
        Object.entries(allowCorsFor(ctx.req.raw)).map(
          ([name, value]) => {
            newHeaders.set(name, value);
          },
        );
      }
      ctx.var.response.headers.forEach((value, key) =>
        newHeaders.append(key, value)
      );
      const printTimings = ctx?.var?.t?.printTimings;
      printTimings && newHeaders.set("Server-Timing", printTimings());

      const responseStatus = ctx.var.response.status ??
        initialResponse.status;

      if (
        url.pathname.startsWith("/_frsh/") &&
        [400, 404, 500].includes(responseStatus)
      ) {
        newHeaders.set("Cache-Control", "no-cache, no-store, private");
      }

      if (ctx?.var?.debugEnabled) {
        for (const flag of ctx.var?.flags ?? []) {
          newHeaders.append(
            DECO_MATCHER_HEADER_QS,
            `${flag.name}=${flag.value ? 1 : 0}`,
          );
        }
      }

      if (ctx.var?.flags.length > 0) {
        const currentCookies = getCookies(ctx.req.raw.headers);
        const cookieSegment = tryOrDefault(
          () => decodeCookie(currentCookies[DECO_SEGMENT]),
          "",
        );
        const segment = tryOrDefault(
          () => JSON.parse(cookieSegment),
          {},
        );

        const active = new Set(segment.active || []);
        const inactiveDrawn = new Set(segment.inactiveDrawn || []);
        for (const flag of ctx.var.flags) {
          if (flag.isSegment) {
            if (flag.value) {
              active.add(flag.name);
              inactiveDrawn.delete(flag.name);
            } else {
              active.delete(flag.name);
              inactiveDrawn.add(flag.name);
            }
          }
        }
        const newSegment = {
          active: [...active].sort(),
          inactiveDrawn: [...inactiveDrawn].sort(),
        };
        const value = JSON.stringify(newSegment);
        const hasFlags = active.size > 0 || inactiveDrawn.size > 0;

        if (hasFlags && cookieSegment !== value) {
          setCookie(newHeaders, {
            name: DECO_SEGMENT,
            value,
            path: "/",
          }, { encode: true });
        }
      }

      const newResponse = new Response(initialResponse.body, {
        status: responseStatus,
        headers: newHeaders,
      });

      ctx.res = newResponse;
    },
  ];
};
