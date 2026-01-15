// deno-lint-ignore-file no-explicit-any
import { HTTPException } from "@hono/hono/http-exception";
import { DECO_MATCHER_HEADER_QS } from "../blocks/matcher.ts";
import { Context, context } from "../deco.ts";
import {
  type Exception,
  getCookies,
  getSetCookies,
  SpanStatusCode,
} from "../deps.ts";
import { startObserve } from "../observability/http.ts";
import { logger } from "../observability/mod.ts";
import { HttpError } from "../runtime/errors.ts";
import type { AppManifest } from "../types.ts";
import { isAdminOrLocalhost } from "../utils/admin.ts";
import { decodeCookie, setCookie } from "../utils/cookies.ts";
import { allowCorsFor } from "../utils/http.ts";
import { formatLog } from "../utils/log.ts";
import { tryOrDefault } from "../utils/object.ts";
import type {
  Context as HonoContext,
  ContextRenderer,
  Handler,
  Input,
  MiddlewareHandler,
} from "./deps.ts";
import { setLogger } from "./fetch/fetchLog.ts";
import { liveness } from "./middlewares/liveness.ts";
import type { Deco, State } from "./mod.ts";
import { sha1 } from "./utils.ts";
export const DECO_SEGMENT = "deco_segment";

const DECO_PAGE_CACHE_CONTROL = Deno.env.get("DECO_PAGE_CACHE_CONTROL") ||
  "public, max-age=120, must-revalidate, s-maxage=120, stale-while-revalidate=86400";

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
    RENDER_FN?: ContextRenderer;
    GLOBALS?: unknown;
  };
};

export type HonoHandler<TManifest extends AppManifest = AppManifest> = Handler<
  DecoRouteState<TManifest>
>;
export type DecoHandler<TManifest extends AppManifest = AppManifest> = (
  c: Parameters<HonoHandler<TManifest>>[0] & { render: ContextRenderer },
  n: Parameters<HonoHandler<TManifest>>[1],
) => ReturnType<HonoHandler<TManifest>>;

export type DecoMiddlewareContext<
  TManifest extends AppManifest = AppManifest,
  P extends string = any,
  // deno-lint-ignore ban-types
  I extends Input = {},
> = HonoContext<DecoRouteState<TManifest>, P, I> & { render: ContextRenderer };

export const createHandler = <TManifest extends AppManifest = AppManifest>(
  handler: DecoHandler<TManifest>,
): DecoHandler<TManifest> =>
async (ctx, next) => {
  try {
    return await handler(ctx, next);
  } catch (_err) {
    const err = _err as { stack?: string; message?: string };
    if (err instanceof HttpError) {
      return err.resp;
    }
    const correlationId = ctx.var.correlationId ?? crypto.randomUUID();
    console.error(`route error ${ctx.req.routePath}: ${err}`, {
      correlationId,
    });
    logger.error(`route ${ctx.req.routePath}: ${err?.stack}`, {
      correlationId,
    });
    throw new HTTPException(500, {
      res: new Response(err?.message ?? `Something went wrong`, {
        status: 500,
        headers: {
          "x-correlation-Id": correlationId,
        },
      }),
    });
  }
};

const DEBUG_COOKIE = "deco_debug";
const DEBUG_ENABLED = "enabled";

export const DEBUG_QS = "__d";
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

/**
 * @description server-timing separator.
 */
const SERVER_TIMING_SEPARATOR: string = ",";
/**
 * @description max length of server-timing header.
 */
const SERVER_TIMING_MAX_LEN: number = 2_000;
/**
 * @description return server-timing string equal or less than size parameter.
 * if timings.length > size then return the timing until the well-formed timing that's smaller than size.
 */
const reduceServerTimingsTo = (timings: string, size: number): string => {
  if (timings.length <= size) return timings;

  return timings.substring(
    0,
    timings.lastIndexOf(SERVER_TIMING_SEPARATOR, size),
  );
};

export const middlewareFor = <TAppManifest extends AppManifest = AppManifest>(
  deco: Deco<TAppManifest>,
): DecoMiddleware<TAppManifest>[] => {
  return [
    // 0 => liveness
    liveness,
    // 1 => statebuilder
    async (ctx, next) => {
      const { enabled, action, correlationId } = DEBUG.fromRequest(
        ctx.req.raw,
      );

      //@ts-ignore: ctx.base dont exist in hono ctx
      ctx.base = ctx.var.global;
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
      await ctx.var.monitoring.tracer.startActiveSpan(
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
            "request.internal": ctx.req.raw.headers.has("traceparent"),
          },
        },
        ctx.var.monitoring.context,
        async (span) => {
          ctx.var.monitoring.rootSpan = span;

          const begin = performance.now();
          const end = startObserve();
          try {
            await next();
          } catch (e) {
            span.recordException(e as Exception);
            throw e;
          } finally {
            const status = ctx.res?.status ?? 500;
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
                ctx.res?.status ?? 500,
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
                  status: ctx.res?.status ?? 500,
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
        return ctx.res = new Response(null, { status: 200 });
      }

      const url = new URL(ctx.req.raw.url); // TODO(mcandeia) check if ctx.url can be used here

      const shouldAllowCorsForOptions = ctx.req.raw.method === "OPTIONS" &&
        isAdminOrLocalhost(ctx.req.raw);

      const initialResponse = shouldAllowCorsForOptions
        ? new Response()
        : await next().then(() => ctx.res!);

      // Let rendering occur — handlers are responsible for calling ctx.var.loadPage
      if (ctx.req.raw.headers.get("upgrade") === "websocket") {
        // for some reason hono deletes content-type when response is not fresh.
        // which means that sometimes it will fail as headers are immutable.
        // so I'm first setting it to undefined and just then set the entire response again
        ctx.res = undefined;
        return ctx.res = initialResponse;
      }
      const newHeaders = new Headers(initialResponse.headers);
      context.platform && newHeaders.set("x-deco-platform", context.platform);

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
      const printedTimings = printTimings &&
        reduceServerTimingsTo(printTimings(), SERVER_TIMING_MAX_LEN);
      printedTimings && newHeaders.set("Server-Timing", printedTimings);

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
          const date = new Date();
          date.setTime(date.getTime() + (30 * 24 * 60 * 60 * 1000)); // 1 month
          setCookie(newHeaders, {
            name: DECO_SEGMENT,
            value,
            path: "/",
            expires: date,
            sameSite: "Lax",
          }, { encode: true });
        }
      }

      // Cache logic implementation
      // Skip cache logic for internal routes that have their own cache handling
      const isInternalRoute = url.pathname.startsWith("/deco/") ||
        url.pathname.startsWith("/_frsh/") ||
        url.pathname.startsWith("/live/");
      
      // Rule 1: If response has set-cookie header, don't cache
      const setCookies = getSetCookies(newHeaders);
      const hasSetCookie = setCookies.length > 0;
      
      // Rule 3: Check if all active flags are cacheable
      // If there are any active flags, all must be cacheable for caching to be allowed
      const activeFlags = ctx.var?.flags?.filter((flag) => flag.value) ?? [];
      const hasActiveFlags = activeFlags.length > 0;
      const nonCacheableFlags = activeFlags.filter((flag) => flag.cacheable !== true);
      const allFlagsCacheable = hasActiveFlags
        ? activeFlags.every((flag) => flag.cacheable === true)
        : true; // No active flags means cacheable by default

      // Check if vary allows caching (loaders may set shouldCache to false)
      const shouldCacheFromVary = ctx?.var?.vary?.shouldCache === true;
      const varyDebug = ctx?.var?.vary?.debug?.build() ?? [];

      // Determine if we should cache (only for GET requests with 200 status, and not internal routes)
      const shouldCache = !isInternalRoute && !hasSetCookie && allFlagsCacheable &&
        shouldCacheFromVary &&
        ctx.req.raw.method === "GET" &&
        responseStatus === 200;

      // Log cache warnings for debugging
      if (!isInternalRoute && ctx.req.raw.method === "GET" && responseStatus === 200) {
        if (hasSetCookie) {
          // Try to identify which section might be setting cookies
          // Extract section name from the last resolvable in the pathTemplate context
          let sectionName = "unknown section";
          try {
            // Try to get section name from pathTemplate or URL
            const pathTemplate = ctx.var?.pathTemplate;
            if (pathTemplate) {
              // Extract a readable section identifier
              const match = pathTemplate.match(/\/([^\/]+)/);
              if (match) {
                sectionName = `"${match[1]}"`;
              }
            }
          } catch {
            // Fallback to unknown
          }
          console.warn(
            `[cache] Page not cached: set-cookie at section ${sectionName}`,
          );
        } else if (!allFlagsCacheable) {
          // List non-cacheable matchers
          const matcherNames = nonCacheableFlags
            .map((flag) => `"${flag.name}"`)
            .join(", ");
          console.warn(
            `[cache] Page not cached: matcher${nonCacheableFlags.length > 1 ? "s" : ""} ${matcherNames} being used`,
          );
        } else if (!shouldCacheFromVary) {
          // Check vary.debug for loaders that prevented caching
          const loadersPreventingCache = varyDebug
            .filter((debug: any) => 
              debug.reason?.cache === "no-store" || debug.reason?.cacheKeyNull
            )
            .map((debug: any) => {
              const resolver = debug.resolver;
              if (!resolver) return null;
              
              // Try to get loader name from resolver
              if (resolver.type === "resolver") {
                return resolver.value;
              }
              
              // Try to extract from resolveChain
              if (resolver.resolveChain) {
                // Find the last resolvable (section) and resolver (loader)
                const resolveChain = resolver.resolveChain;
                const lastResolver = resolveChain
                  .slice()
                  .reverse()
                  .find((item: any) => item.type === "resolver");
                const lastResolvable = resolveChain
                  .slice()
                  .reverse()
                  .find((item: any) => item.type === "resolvable");
                
                if (lastResolver && lastResolvable) {
                  return `"${lastResolvable.value}" executed dynamic loader "${lastResolver.value}"`;
                } else if (lastResolver) {
                  return `"${lastResolver.value}"`;
                } else if (lastResolvable) {
                  return `section "${lastResolvable.value}"`;
                }
              }
              
              return null;
            })
            .filter((name): name is string => name !== null);
          
          if (loadersPreventingCache.length > 0) {
            const message = loadersPreventingCache.join(", ");
            console.warn(
              `[cache] Page not cached: ${message}`,
            );
          } else {
            console.warn(
              `[cache] Page not cached: dynamic loader(s) executed`,
            );
          }
        }
      }

      if (hasSetCookie) {
        // Rule 1: If response has set-cookie header, set cache-control to no-store
        newHeaders.set("Cache-Control", "no-store, no-cache, must-revalidate");
      } else if (!allFlagsCacheable) {
        // Rule 3: If not all active flags are cacheable, don't cache
        newHeaders.set("Cache-Control", "no-store, no-cache, must-revalidate");
      } else if (shouldCache) {
        // Rule 2: Build cache key using vary.build() which contains all loader __cb values
        const varyKey = ctx.var?.vary?.build() ?? "";
        
        
        // Generate ETag from vary key and flag cacheKeys
        // Include both varyKey (loader __cb values) and flag cacheKeys
        const etagSource = varyKey ?? url.toString();
        const etagHash = await sha1(etagSource);
        const etagValue = `"${etagHash}"`;
        newHeaders.set("ETag", etagValue);
        
        // Check if client sent If-None-Match header
        const ifNoneMatch = ctx.req.raw.headers.get("If-None-Match");
        if (ifNoneMatch === etagValue || ifNoneMatch === `W/${etagValue}`) {
          // Return 304 Not Modified
          ctx.res = undefined;
          return ctx.res = new Response(null, {
            status: 304,
            headers: newHeaders,
          });
        }
        
        // Set cache-control for public caching
        newHeaders.set("Cache-Control", DECO_PAGE_CACHE_CONTROL);
      } else {
        // Default: no cache
        newHeaders.set("Cache-Control", "no-store, no-cache, must-revalidate");
      }

      // for some reason hono deletes content-type when response is not fresh.
      // which means that sometimes it will fail as headers are immutable.
      // so I'm first setting it to undefined and just then set the entire response again
      ctx.res = undefined;
      ctx.res = new Response(initialResponse.body, {
        status: responseStatus,
        headers: newHeaders,
      });
    },
  ];
};
