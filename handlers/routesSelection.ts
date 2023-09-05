import { ConnInfo, Handler } from "std/http/server.ts";
import { ResolveOptions } from "../engine/core/mod.ts";
import {
  BaseContext,
  isDeferred,
  Resolvable,
  ResolveFunc,
} from "../engine/core/resolver.ts";
import { isAwaitable } from "../engine/core/utils.ts";
import { Route, Routes } from "../flags/audience.ts";
import { isFreshCtx } from "../handlers/fresh.ts";
import { observe } from "../observability/observe.ts";
import { Flag, LiveState, RouterContext } from "../types.ts";

export interface SelectionConfig {
  audiences: Routes[];
}

interface MaybePriorityHandler {
  func: Resolvable<Handler>;
  highPriority?: boolean;
}

const HIGH_PRIORITY_ROUTE_RANK_BASE_VALUE = 1000;

const rankRoute = (pattern: string) =>
  pattern
    .split("/")
    .reduce(
      (acc, routePart) =>
        routePart.endsWith("*")
          ? acc
          : routePart.startsWith(":")
          ? acc + 1
          : acc + 2,
      0,
    );

/**
 * Since `routePath` is used, for example, by redirects, it can have strings
 * such as "/cachorros?PS=12".
 */
const createUrlPatternFromHref = (href: string) => {
  const [pathname, searchRaw] = href.split("?");
  const search = searchRaw ? `?${encodeURIComponent(searchRaw)}` : undefined;

  return new URLPattern({ pathname, search });
};

export const router = (
  routes: Route[],
  hrefRoutes: Record<string, Resolvable<Handler>> = {},
  resolver: ResolveFunc,
  configs?: ResolveOptions,
): Handler => {
  return async (req: Request, connInfo: ConnInfo): Promise<Response> => {
    const url = new URL(req.url);
    const route = async (
      handler: Resolvable<Handler>,
      routePath: string,
      groups?: Record<string, string | undefined>,
    ) => {
      const ctx = { ...connInfo, params: (groups ?? {}) } as ConnInfo & {
        params: Record<string, string>;
        state: {
          routes: Route[];
          routerInfo: RouterContext;
          flags: Flag[];
        };
      };

      ctx.state.routes = routes;
      ctx.state.routerInfo = {
        flags: ctx.state.flags,
        pagePath: routePath,
      };

      const resolvedOrPromise =
        isDeferred<Handler, { context: typeof ctx } & BaseContext>(handler)
          ? handler({ context: ctx })
          : resolver<Handler>(
            handler,
            configs,
            { context: ctx, request: req },
          );

      const end = configs?.monitoring?.t.start("load-data");
      const hand = isAwaitable(resolvedOrPromise)
        ? await resolvedOrPromise
        : resolvedOrPromise;
      end?.();

      return await hand(
        req,
        ctx,
      );
    };
    const handler = hrefRoutes[`${url.pathname}${url.search || ""}`] ??
      hrefRoutes[url.pathname];
    if (handler) {
      return route(
        handler,
        `${url.pathname}${url.search || ""}`,
      );
    }
    for (const { pathTemplate: routePath, handler } of routes) {
      const pattern = createUrlPatternFromHref(routePath);
      const res = pattern.exec(req.url);
      const groups = res?.pathname.groups ?? {};

      if (res !== null) {
        return await route(handler.value, routePath, groups);
      }
    }

    return new Response(null, {
      status: 404,
    });
  };
};

export const toRouteMap = (
  routes?: Route[],
): [
  Record<string, MaybePriorityHandler>,
  Record<string, Resolvable<Handler>>,
] => {
  const routeMap: Record<string, MaybePriorityHandler> = {};
  const hrefRoutes: Record<string, Resolvable<Handler>> = {};
  (routes ?? [])
    .forEach(
      ({ pathTemplate, isHref, highPriority, handler: { value: handler } }) => {
        if (isHref) {
          hrefRoutes[pathTemplate] = handler;
        } else {
          routeMap[pathTemplate] = { func: handler, highPriority };
        }
      },
    );
  return [routeMap, hrefRoutes];
};

export const buildRoutes = (audiences: Routes[]): [
  Record<string, MaybePriorityHandler>,
  Record<string, Resolvable<Handler>>,
] => {
  // We should tackle this problem elsewhere
  return audiences.filter(Boolean)
    .reduce(
      ([routes, hrefRoutes], audience) => {
        // check if the audience matches with the given context considering the `isMatch` provided by the cookies.
        const [newRoutes, newHrefRoutes] = toRouteMap(audience ?? []);
        return [
          { ...routes, ...newRoutes },
          { ...hrefRoutes, ...newHrefRoutes },
        ];
      },
      [{}, {}] as [
        Record<string, MaybePriorityHandler>,
        Record<string, Resolvable<Handler>>,
      ],
    );
};
/**
 * @title Routes Selection
 * @description Select routes based on the target audience.
 */
export default function RoutesSelection(
  { audiences }: SelectionConfig,
  ctx: { get: ResolveFunc },
): Handler {
  return async (req: Request, connInfo: ConnInfo): Promise<Response> => {
    const t = isFreshCtx<LiveState>(connInfo) ? connInfo.state.t : undefined;

    // everyone should come first in the list given that we override the everyone value with the upcoming flags.
    const [routes, hrefRoutes] = buildRoutes(audiences);
    // build the router from entries
    const builtRoutes = Object.entries(routes).sort((
      [routeStringA, { highPriority: highPriorityA }],
      [routeStringB, { highPriority: highPriorityB }],
    ) =>
      (highPriorityB ? HIGH_PRIORITY_ROUTE_RANK_BASE_VALUE : 0) +
      rankRoute(routeStringB) -
      ((highPriorityA ? HIGH_PRIORITY_ROUTE_RANK_BASE_VALUE : 0) +
        rankRoute(routeStringA))
    );

    const server = router(
      builtRoutes.map((route) => ({
        pathTemplate: route[0],
        handler: { value: route[1].func },
      })),
      hrefRoutes,
      ctx.get,
      {
        monitoring: t ? { t, observe } : undefined,
      },
    );

    return await server(req, connInfo);
  };
}
