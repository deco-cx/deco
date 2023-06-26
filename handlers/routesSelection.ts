import { ResolveOptions } from "$live/engine/core/mod.ts";
import { Resolvable } from "$live/engine/core/resolver.ts";
import { isAwaitable } from "$live/engine/core/utils.ts";
import { AudienceValue, Override, Route } from "$live/flags/audience.ts";
import { isFreshCtx } from "$live/handlers/fresh.ts";
import { context } from "$live/live.ts";
import { LiveState, RouterContext } from "$live/types.ts";
import { ConnInfo, Handler } from "std/http/server.ts";

export interface SelectionConfig {
  audiences: AudienceValue[];
}

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
  configs?: ResolveOptions,
): Handler => {
  return async (req: Request, connInfo: ConnInfo): Promise<Response> => {
    const url = new URL(req.url);
    const href = `${url.pathname}${url.search || ""}`;
    const route = async (
      handler: Resolvable<Handler>,
      routePath: string,
      groups?: Record<string, string | undefined>,
    ) => {
      const ctx = { ...connInfo, params: (groups ?? {}) } as ConnInfo & {
        params: Record<string, string>;
        state: {
          routerInfo: RouterContext;
        };
      };

      ctx.state.routerInfo = {
        flags: "",
        pagePath: routePath,
      };

      const resolvedOrPromise = context.releaseResolver!.resolve<Handler>(
        handler,
        { context: ctx, request: req },
        configs,
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
    if (href && hrefRoutes[href]) {
      return route(hrefRoutes[href], href);
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
  Record<string, Resolvable<Handler>>,
  Record<string, Resolvable<Handler>>,
] => {
  const routeMap: Record<string, Resolvable<Handler>> = {};
  const hrefRoutes: Record<string, Resolvable<Handler>> = {};
  (routes ?? [])
    .forEach(({ pathTemplate, isHref, handler: { value: handler } }) => {
      if (isHref) {
        hrefRoutes[pathTemplate] = handler;
      } else {
        routeMap[pathTemplate] = handler;
      }
    });
  return [routeMap, hrefRoutes];
};
const toOverrides = (overrides?: Override[]): Record<string, string> => {
  const overrideMap: Record<string, string> = {};
  (overrides ?? []).forEach(({ insteadOf, use }) => {
    overrideMap[insteadOf] = use;
  });
  return overrideMap;
};

/**
 * @title Routes Selection
 * @description Select routes based on the target audience.
 */
export default function RoutesSelection(
  { audiences: audiences }: SelectionConfig,
): Handler {
  return async (req: Request, connInfo: ConnInfo): Promise<Response> => {
    const t = isFreshCtx<LiveState>(connInfo) ? connInfo.state.t : undefined;

    // everyone should come first in the list given that we override the everyone value with the upcoming flags.
    const [routes, overrides, hrefRoutes] = audiences
      // We should tackle this problem elsewhere
      .filter(Boolean)
      .reduce(
        ([routes, overrides, hrefRoutes], audience) => {
          // check if the audience matches with the given context considering the `isMatch` provided by the cookies.
          const [newRoutes, newHrefRoutes] = toRouteMap(audience.routes ?? []);
          return [
            { ...routes, ...newRoutes },
            { ...overrides, ...toOverrides(audience.overrides ?? []) },
            { ...hrefRoutes, ...newHrefRoutes },
          ];
        },
        [{}, {}, {}] as [
          Record<string, Resolvable<Handler>>,
          Record<string, string>,
          Record<string, Resolvable<Handler>>,
        ],
      );

    // build the router from entries
    const builtRoutes = Object.entries(routes).sort((
      [routeStringA],
      [routeStringB],
    ) => rankRoute(routeStringB) - rankRoute(routeStringA));

    const server = router(
      builtRoutes.map((route) => ({
        pathTemplate: route[0],
        handler: { value: route[1] },
      })),
      hrefRoutes,
      {
        overrides,
        monitoring: t ? { t } : undefined,
      },
    );

    return await server(req, connInfo);
  };
}
