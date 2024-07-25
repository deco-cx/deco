import type { DecoMiddleware } from "deco/runtime/routing/middleware.ts";
import { Context } from "../../../deco.ts";
import {
  context as otelContext,
  getCookies,
  setCookie,
} from "../../../deps.ts";
import { observe } from "../../../observability/observe.ts";
import { tracer } from "../../../observability/otel/config.ts";
import {
  REQUEST_CONTEXT_KEY,
  STATE_CONTEXT_KEY,
} from "../../../observability/otel/context.ts";
import type { AppManifest } from "../../../types.ts";
import { forceHttps } from "../../../utils/http.ts";
import { buildInvokeFunc } from "../../../utils/invoke.server.ts";
import { createServerTimings } from "../../../utils/timings.ts";
import { setLogger } from "../../fetch/fetchLog.ts";

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
): DecoMiddleware<TManifest> =>
  async function (
    ctx,
  ) {
    const { enabled, action, correlationId } = debug.fromRequest(ctx.req);

    const t = createServerTimings();
    if (enabled) {
      ctx.state.t = t;
      ctx.state.debugEnabled = true;
      ctx.state.correlationId = correlationId;
    }

    ctx.state.monitoring = {
      timings: t,
      metrics: observe,
      tracer,
      context: otelContext.active().setValue(REQUEST_CONTEXT_KEY, ctx.req)
        .setValue(
          STATE_CONTEXT_KEY,
          ctx.state,
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
      setLogger(ctx.state.monitoring.logger.log);
    }

    const url = new URL(ctx.req.url);
    const isEchoRoute = url.pathname.startsWith("/live/_echo"); // echoing

    if (isEchoRoute) {
      return new Response(ctx.req.body, {
        status: 200,
        headers: ctx.req.headers,
      });
    }

    const liveContext = Context.active();
    if (!liveContext.runtime) {
      console.error(
        "live runtime is not present, the apps were properly installed?",
      );
      return ctx.next();
    }

    const isLiveMeta = url.pathname.startsWith("/live/_meta") ||
      url.pathname.startsWith("/deco/meta"); // live-meta
    const { resolver } = await liveContext.runtime;
    const ctxResolver = resolver
      .resolverFor(
        { context: ctx, request: forceHttps(ctx.req) },
        {
          monitoring: ctx.state.monitoring,
        },
      )
      .bind(resolver);

    const isInternalOrStatic = url.pathname.startsWith("/_frsh") || // fresh urls /_fresh/js/*
      url.pathname.startsWith("~partytown") || // party town urls
      url.searchParams.has("__frsh_c");
    if (
      !isInternalOrStatic && resolveKey
    ) {
      const timing = ctx?.state?.t?.start("load-page");
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
      ctx.state.$live = $live;
    }

    ctx.state.resolve = ctxResolver;
    ctx.state.release = liveContext.release!;

    ctx.state.invoke = buildInvokeFunc<TManifest>(ctxResolver, {}, {
      isInvoke: true,
    });

    const resp = await ctx.next();
    // enable or disable debugging
    if (ctx.req.headers.get("upgrade") === "websocket") {
      return resp;
    }
    action(resp);
    setLogger(null);

    return resp;
  };
