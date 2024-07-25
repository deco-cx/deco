import { DECO_MATCHER_HEADER_QS } from "../../../blocks/matcher.ts";
import { Context } from "../../../deco.ts";
import { getCookies, SpanStatusCode } from "../../../deps.ts";
import type { Resolvable } from "../../../engine/core/resolver.ts";
import type { Apps } from "../../../mod.ts";
import { startObserve } from "../../../observability/http.ts";
import { isAdminOrLocalhost } from "../../../utils/admin.ts";
import { decodeCookie, setCookie } from "../../../utils/cookies.ts";
import { allowCorsFor } from "../../../utils/http.ts";
import { formatLog } from "../../../utils/log.ts";
import { tryOrDefault } from "../../../utils/object.ts";
import { initializeState } from "../../utils.ts";
import type { DecoMiddleware } from "../middleware.ts";

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
export const handler: DecoMiddleware[] = [
  async (
    ctx,
    next,
  ): Promise<Response> => {
    const url = new URL(ctx.req.url); // TODO(mcandeia) check if ctx.url can be used here
    const context = Context.active();
    return await ctx.var.monitoring.tracer.startActiveSpan(
      "./routes/_middleware.ts",
      {
        attributes: {
          "deco.site.name": context.site,
          "http.request.url": ctx.req.url,
          "http.request.method": ctx.req.method,
          "http.request.body.size": ctx.req.header("content-length") ??
            undefined,
          "url.scheme": url.protocol,
          "server.address": url.host,
          "url.query": url.search,
          "url.path": url.pathname,
          "user_agent.original": ctx.req.header("user-agent") ?? undefined,
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
          return (response = ctx.res);
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
          if (ctx?.var?.pathTemplate) {
            const route = `${ctx.req.method} ${ctx?.var?.pathTemplate}`;
            span.updateName(route);
            span.setAttribute("http.route", route);
            end?.(
              ctx.req.method,
              ctx?.var?.pathTemplate,
              response?.status ?? 500,
            );
          } else {
            span.updateName(`${ctx.req.method} ${ctx.req.url}`);
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
  async (
    ctx,
    next,
  ) => {
    if (ctx.req.method === "HEAD" && isMonitoringRobots(ctx.req.raw)) {
      return new Response(null, { status: 200 });
    }

    const url = new URL(ctx.req.url); // TODO(mcandeia) check if ctx.url can be used here

    const state = initializeState(ctx.var?.$live?.state);
    Object.assign(ctx.var, state);
    ctx.set("global", { ...(ctx.var.global ?? {}), ...state });

    const shouldAllowCorsForOptions = ctx.req.method === "OPTIONS" &&
      isAdminOrLocalhost(ctx.req.raw);

    const initialResponse = shouldAllowCorsForOptions
      ? new Response()
      : await next().then(() => ctx.res);

    // Let rendering occur — handlers are responsible for calling ctx.state.loadPage
    if (ctx.req.header("upgrade") === "websocket") {
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
      Object.entries(allowCorsFor(ctx.req.raw)).map(([name, value]) => {
        newHeaders.set(name, value);
      });
    }
    state.response.headers.forEach((value, key) =>
      newHeaders.append(key, value)
    );
    const printTimings = ctx?.var?.t?.printTimings;
    printTimings && newHeaders.set("Server-Timing", printTimings());

    const responseStatus = state.response.status ?? initialResponse.status;

    if (
      url.pathname.startsWith("/_frsh/") &&
      [400, 404, 500].includes(responseStatus)
    ) {
      newHeaders.set("Cache-Control", "no-cache, no-store, private");
    }

    if (ctx?.var?.debugEnabled) {
      for (const flag of state?.flags ?? []) {
        newHeaders.append(
          DECO_MATCHER_HEADER_QS,
          `${flag.name}=${flag.value ? 1 : 0}`,
        );
      }
    }

    if (state?.flags.length > 0) {
      const currentCookies = getCookies(ctx.req.raw.headers);
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
