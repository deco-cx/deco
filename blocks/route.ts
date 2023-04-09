// deno-lint-ignore-file no-explicit-any
import { Handler, HandlerContext, Handlers, PageProps } from "$fresh/server.ts";
import {
  MiddlewareHandler,
  MiddlewareHandlerContext,
  MiddlewareRoute,
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
    (handlerIsFunc || defaultIsFunc || handlerIsFuncMap) &&
    !Array.isArray((v as MiddlewareRoute).handler)
  );
};
const middlewareKey = "./routes/_middleware.ts";

const mapMiddleware = (
  mid: MiddlewareHandler<LiveConfig<any, LiveState>>,
): MiddlewareHandler<LiveConfig<any, LiveState>> => {
  return async function (
    request: Request,
    context: MiddlewareHandlerContext<LiveConfig<any, LiveState>>,
  ) {
    const { start, end, printTimings } = createServerTimings();
    context.state.t = { start, end, printTimings };
    const url = new URL(request.url);
    if (
      url.pathname.startsWith("/_frsh") ||
      url.pathname.startsWith("~partytown") ||
      url.searchParams.has("__frsh_c")
    ) {
      return mid(request, context);
    }

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
      !liveContext.isDeploy || url.searchParams.has("forceFresh") ||
        url.searchParams.has("pageId"), // Force fresh only once per request meaning that only the _middleware will force the fresh to happen the others will reuse the fresh data.
    )) ?? {};

    endTiming();
    context.state = { ...context.state, $live, resolve: ctxResolver };
    return await mid(request, context);
  };
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
        const $live = await context.state.resolve(
          key,
        ); // middleware should be executed first.
        context.state = { ...context.state, $live };

        return val!(request, context);
      };
    });
  }
  return async function (
    request: Request,
    context: HandlerContext<any, LiveConfig<any, LiveState>>,
  ) {
    const end = context.state.t.start(`resolve-${key}`);
    const $live = (await context.state.resolve(
      key,
    )) ?? {};

    end && end();

    if (typeof handlers === "function") {
      context.state = { ...context.state, $live };
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
    if (
      isConfigurableRoute(routeModule)
    ) {
      if (key === middlewareKey) {
        return {
          ...routeModule,
          handler: mapMiddleware(
            routeModule.handler as MiddlewareHandler<
              LiveConfig<any, LiveState>
            >,
          ),
        };
      }
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
