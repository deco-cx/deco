import { MiddlewareHandlerContext } from "$fresh/server.ts";
import { DECO_MATCHER_HEADER_QS } from "../../../blocks/matcher.ts";
import { RequestState } from "../../../blocks/utils.tsx";
import { Context } from "../../../deco.ts";
import { getCookies, SpanStatusCode } from "../../../deps.ts";
import { Resolvable } from "../../../engine/core/resolver.ts";
import { Apps } from "../../../mod.ts";
import { startObserve } from "../../../observability/http.ts";
import { DecoSiteState, DecoState } from "../../../types.ts";
import { isAdminOrLocalhost } from "../../../utils/admin.ts";
import { decodeCookie, setCookie } from "../../../utils/cookies.ts";
import { allowCorsFor, defaultHeaders } from "../../../utils/http.ts";
import { formatLog } from "../../../utils/log.ts";
import { tryOrDefault } from "../../../utils/object.ts";

export const DECO_SEGMENT = "deco_segment";

/**
 * @description Global configurations for ./routes/_middleware.ts route
 */
export interface MiddlewareConfig {
  /**
   * @description Configure your loaders global state.
   */
  state: Record<string, Resolvable>;
  apps?: Apps[];
}

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
export const handler = [
  async (
    req: Request,
    ctx: MiddlewareHandlerContext<DecoState<MiddlewareConfig, DecoSiteState>>,
  ): Promise<Response> => {
    const url = new URL(req.url); // TODO(mcandeia) check if ctx.url can be used here
    const context = Context.active();
    return await ctx.state.monitoring.tracer.startActiveSpan(
      "./routes/_middleware.ts",
      {
        attributes: {
          "deco.site.name": context.site,
          "http.request.url": req.url,
          "http.request.method": req.method,
          "http.request.body.size": req.headers.get("content-length") ??
            undefined,
          "url.scheme": url.protocol,
          "server.address": url.host,
          "url.query": url.search,
          "url.path": url.pathname,
          "user_agent.original": req.headers.get("user-agent") ?? undefined,
          "http.route.destination": ctx.destination,
        },
      },
      ctx.state.monitoring.context,
      async (span) => {
        ctx.state.monitoring.rootSpan = span;

        const begin = performance.now();
        const end = startObserve();
        let response: Response | null = null;
        try {
          return (response = await ctx.next());
        } catch (e) {
          span.recordException(e);
          throw e;
        } finally {
          const status = response?.status ?? 500;
          const isErr = status >= 500;
          span.setStatus({
            code: isErr ? SpanStatusCode.ERROR : SpanStatusCode.OK,
          });
          span.setAttribute("http.response.status_code", `${status}`);
          if (ctx?.state?.pathTemplate) {
            const route = `${req.method} ${ctx?.state?.pathTemplate}`;
            span.updateName(route);
            span.setAttribute("http.route", route);
            end?.(
              req.method,
              ctx?.state?.pathTemplate,
              response?.status ?? 500,
            );
          } else {
            span.updateName(`${req.method} ${req.url}`);
          }
          span.end();
          if (!url.pathname.startsWith("/_frsh")) {
            console.info(
              formatLog({
                status: response?.status ?? 500,
                url,
                begin,
                timings: ctx.state.debugEnabled
                  ? ctx.state.monitoring.timings.get()
                  : undefined,
              }),
            );
          }
        }
      },
    );
  },
  async (
    req: Request,
    ctx: MiddlewareHandlerContext<DecoState<MiddlewareConfig, DecoSiteState>>,
  ) => {
    if (req.method === "HEAD" && isMonitoringRobots(req)) {
      return new Response(null, { status: 200 });
    }
    const context = Context.active();
    const url = new URL(req.url); // TODO(mcandeia) check if ctx.url can be used here
    ctx.state.site = {
      id: context.siteId,
      name: context.site,
    };

    const response = {
      headers: new Headers(defaultHeaders),
      status: undefined,
    };
    const state: Partial<RequestState> = ctx.state?.$live?.state ?? {};
    const stateBag = new WeakMap();
    state.response = response;
    state.bag = stateBag;
    state.flags = [];
    Object.assign(ctx.state, state);
    ctx.state.global = { ...(ctx.state.global ?? {}), ...state }; // compatibility mode with functions.

    const shouldAllowCorsForOptions = req.method === "OPTIONS" &&
      isAdminOrLocalhost(req);

    const initialResponse = shouldAllowCorsForOptions
      ? new Response()
      : await ctx.next();

    // Let rendering occur — handlers are responsible for calling ctx.state.loadPage
    if (req.headers.get("upgrade") === "websocket") {
      return initialResponse;
    }
    const newHeaders = new Headers(initialResponse.headers);
    if (
      (url.pathname.startsWith("/live/previews") &&
        url.searchParams.has("mode") &&
        url.searchParams.get("mode") == "showcase") ||
      url.pathname.startsWith("/_frsh/") ||
      shouldAllowCorsForOptions
    ) {
      Object.entries(allowCorsFor(req)).map(([name, value]) => {
        newHeaders.set(name, value);
      });
    }
    response.headers.forEach((value, key) => newHeaders.append(key, value));
    const printTimings = ctx?.state?.t?.printTimings;
    printTimings && newHeaders.set("Server-Timing", printTimings());

    const responseStatus = response.status ?? initialResponse.status;

    if (
      url.pathname.startsWith("/_frsh/") &&
      [400, 404, 500].includes(responseStatus)
    ) {
      newHeaders.set("Cache-Control", "no-cache, no-store, private");
    }

    if (ctx?.state?.debugEnabled) {
      for (const flag of state?.flags ?? []) {
        newHeaders.append(
          DECO_MATCHER_HEADER_QS,
          `${flag.name}=${flag.value ? 1 : 0}`,
        );
      }
    }

    if (state?.flags.length > 0) {
      const currentCookies = getCookies(req.headers);
      const cookieSegment = tryOrDefault(
        () => decodeCookie(currentCookies[DECO_SEGMENT]),
        "",
      );
      const segment = tryOrDefault(() => JSON.parse(cookieSegment), {});

      const active = new Set(segment.active || []);
      const inactiveDrawn = new Set(segment.inactiveDrawn || []);
      for (const flag of state.flags) {
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

    return newResponse;
  },
];
