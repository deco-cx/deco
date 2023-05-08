// deno-lint-ignore-file no-explicit-any
import { Handler, HandlerContext, Handlers, PageProps } from "$fresh/server.ts";
import {
  MiddlewareHandler,
  MiddlewareHandlerContext,
  MiddlewareModule,
  RouteConfig,
  RouteModule,
} from "$fresh/src/server/types.ts";
import { Block, BlockModule, ComponentFunc } from "$live/engine/block.ts";
import { mapObjKeys } from "$live/engine/core/utils.ts";
import { context as liveContext } from "$live/live.ts";
import { DecoManifest, LiveConfig, LiveState } from "$live/types.ts";
import { createServerTimings } from "$live/utils/timings.ts";
import { METHODS } from "https://deno.land/x/rutt@0.0.13/mod.ts";

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

const hasAnyMethod = (obj: Record<string, any>): boolean => {
  for (const method in METHODS) {
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
  "./routes/index.tsx": "./routes/[...catchall].tsx",
};
const mapMiddleware = (
  mid: MiddlewareHandler<LiveConfig<any, LiveState>> | MiddlewareHandler<
    LiveConfig<any, LiveState>
  >[],
): MiddlewareHandler<LiveConfig<any, LiveState>>[] => {
  return [async function (
    request: Request,
    context: MiddlewareHandlerContext<LiveConfig<any, LiveState>>,
  ) {
    const { start, end, printTimings } = createServerTimings();
    context.state.t = { start, end, printTimings };
    const url = new URL(request.url);
    const isInternalOrStatic = url.pathname.startsWith("/_frsh") || // fresh urls /_fresh/js/*
      url.pathname.startsWith("~partytown") || // party town urls
      url.searchParams.has("__frsh_c"); // static assets, fresh uses ?__fresh_c=$id

    const resolver = liveContext.configResolver!;
    const ctxResolver = resolver
      .resolverFor(
        { context, request },
        {
          monitoring: { t: context.state.t },
        },
      )
      .bind(resolver);

    const endTiming = start("load-page");
    const $live = (await ctxResolver(
      middlewareKey,
      !isInternalOrStatic && (
        !liveContext.isDeploy || url.searchParams.has("forceFresh") ||
        url.searchParams.has("pageId") // Force fresh only once per request meaning that only the _middleware will force the fresh to happen the others will reuse the fresh data.
      ),
    )) ?? {};

    endTiming();
    context.state.$live = $live;
    context.state.resolve = ctxResolver;

    return context.next();
  }, ...Array.isArray(mid) ? mid : [mid]];
};
const mapHandlers = (
  key: string,
  handlers: Handler<any, any> | Handlers<any, any> | undefined,
): Handler<any, any> | Handlers<any, any> => {
  if (typeof handlers === "object") {
    return mapObjKeys(handlers, (val) => {
      return async function (
        request: Request,
        context: HandlerContext<any, LiveConfig<any, LiveState>>,
      ) {
        const $live = await context?.state?.resolve?.(
          indexTsxToCatchAll[key] ?? key,
        ); // middleware should be executed first.
        context.state.$live = $live;

        return val!(request, context);
      };
    });
  }
  return async function (
    request: Request,
    context: HandlerContext<any, LiveConfig<any, LiveState>>,
  ) {
    const end = context?.state?.t.start(`resolve-${key}`);
    const $live = (await context?.state?.resolve?.(
      indexTsxToCatchAll[key] ?? key,
    )) ?? {};

    end?.();

    if (typeof handlers === "function") {
      context.state.$live = $live;

      return await handlers(request, context);
    }
    return await context.render($live);
  };
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
        handler: mapHandlers(liveKey, handl),
      };
    }
    return routeModule;
  },
  introspect: [{
    handler: ["1", "state.$live"],
  }, {
    default: ["0", "data"],
  }],
  type: blockType,
};

export default routeBlock;
