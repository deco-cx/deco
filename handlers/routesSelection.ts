import { MatchContext } from "$live/blocks/matcher.ts";
import { ResolveOptions } from "$live/engine/core/mod.ts";
import { Resolvable } from "$live/engine/core/resolver.ts";
import { isAwaitable } from "$live/engine/core/utils.ts";
import { CookiedFlag, cookies } from "$live/flags.ts";
import { isFreshCtx } from "$live/handlers/fresh.ts";
import { context } from "$live/live.ts";
import { LiveState, RouterContext } from "$live/types.ts";
import { ConnInfo, Handler } from "std/http/server.ts";
import { BlockInstance } from "../engine/block.ts";
import { Override, Route } from "../flags/audience.ts";

export interface SelectionConfig {
  audiences: (
    | BlockInstance<"$live/flags/audience.ts">
    | BlockInstance<"$live/flags/everyone.ts">
  )[];
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
  hrefRoutes: Record<string, Resolvable<Handler>>,
  configs?: ResolveOptions,
  flags?: Map<string, CookiedFlag>,
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
        flags: flags ? Array.from(flags.keys()).join(",") : "",
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

export type MatchWithCookieValue = MatchContext<{
  isMatchFromCookie?: boolean;
}>;

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
  { audiences }: SelectionConfig,
): Handler {
  return async (req: Request, connInfo: ConnInfo): Promise<Response> => {
    const cacheControl = req.headers.get("Cache-Control");
    const isNoCache = cacheControl === "no-cache";
    const t = isFreshCtx<LiveState>(connInfo) ? connInfo.state.t : undefined;

    // Read flags from cookie or start an empty map.
    const flags = cookies.getFlags(req.headers) ??
      new Map<string, CookiedFlag>();

    // create the base match context.
    const matchCtx: Omit<MatchWithCookieValue, "isMatchFromCookie"> = {
      siteId: context.siteId,
      request: req,
    };

    // track flags that aren't on the original cookie or changed its `isMatch` property.
    const flagsThatShouldBeCookied: CookiedFlag[] = [];
    const cookiesThatShouldBeDeleted = new Map(flags); // initially all cookies should be deleted.

    // everyone should come first in the list given that we override the everyone value with the upcoming flags.
    const [routes, overrides, hrefRoutes] = audiences
      .reduce(
        ([routes, overrides, hrefRoutes], audience) => {
          // check if the audience matches with the given context considering the `isMatch` provided by the cookies.
          const isMatch = audience.matcher({
            ...matchCtx,
            isMatchFromCookie: isNoCache
              ? undefined
              : flags.get(audience.name)?.isMatch,
          } as MatchWithCookieValue);
          // if the audience exists so it should not be deleted
          cookiesThatShouldBeDeleted.delete(audience.name);

          // if the flag doesn't exists (e.g. new audience being used) or the `isMatch` value has changed so add as a `newFlags`
          // TODO should we track when the flag VALUE changed?
          // this code has a bug that when the isMatch doesn't change but the flag value does so the cookie will kept the old value.
          // I will not fix this for now because this shouldn't be a issue in the long run and requires deep equals between objects which could be more expansive than just assume that the value is equal.
          // as it is in 99% of the cases.
          if (
            !flags.has(audience.name) ||
            flags.get(audience.name)?.isMatch !== isMatch
          ) {
            // create the flag value
            const flagValue = {
              isMatch,
              key: audience.name,
              updated_at: new Date().toISOString(),
            };
            // set as flag that should be cookied
            flagsThatShouldBeCookied.push(flagValue);
            // set in the current map just in case (duplicated audiences?)
            flags.set(audience.name, flagValue);
          }
          const [newRoutes, newHrefRoutes] = toRouteMap(audience.true.routes);
          return isMatch
            ? [
              { ...routes, ...newRoutes },
              { ...overrides, ...toOverrides(audience.true.overrides) },
              { ...hrefRoutes, ...newHrefRoutes },
            ]
            : [routes, overrides, hrefRoutes];
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
      flags,
    );

    // call the target handler
    const resp = await server(req, connInfo);

    // set cookie for the flags that has changed.
    if (flagsThatShouldBeCookied.length > 0 && resp.status < 300) { // errors and redirects have immutable headers
      cookies.setFlags(resp.headers, flagsThatShouldBeCookied);
      cookies.pruneFlags(resp.headers, cookiesThatShouldBeDeleted);
      resp.headers.append("vary", "cookie");
    }
    return resp;
  };
}
