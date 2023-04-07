// deno-lint-ignore-file no-explicit-any
import { Handler, HandlerContext, Handlers, PageProps } from "$fresh/server.ts";
import {
  MiddlewareRoute,
  RouteConfig,
  RouteModule,
} from "$fresh/src/server/types.ts";
import { Block, BlockModule, ComponentFunc } from "$live/engine/block.ts";
import { mapObjKeys } from "$live/engine/core/utils.ts";
import { context as liveContext } from "$live/live.ts";
import { DecoManifest, LiveConfig, LiveState } from "$live/types.ts";
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
    const url = new URL(request.url);
    const resolver = liveContext.configResolver!;
    const ctxResolver = resolver
      .resolverFor(
        { context, request },
        {
          monitoring: context?.state?.t
            ? {
              t: context.state.t!,
            }
            : undefined,
        },
      )
      .bind(resolver);

    const $live = (await ctxResolver(
      key,
      middlewareKey === key && // Force fresh only once per request meaning that only the _middleware will force the fresh to happen the others will reuse the fresh data.
        (url.searchParams.has("forceFresh") || url.searchParams.has("pageId")),
    )) ?? {};

    if (typeof handlers === "function") {
      context.state = { ...context.state, $live, resolve: ctxResolver };
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
