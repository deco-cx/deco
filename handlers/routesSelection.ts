import { MatchContext } from "$live/blocks/matcher.ts";
import { ResolveOptions } from "$live/engine/core/mod.ts";
import { Resolvable } from "$live/engine/core/resolver.ts";
import { isAwaitable } from "$live/engine/core/utils.ts";
import { CookiedFlag, cookies } from "$live/flags.ts";
import { isFreshCtx } from "$live/handlers/fresh.ts";
import { context } from "$live/live.ts";
import { LiveState, RouterContext, WarmUpLoadersContext } from "$live/types.ts";
import { ConnInfo, Handler } from "std/http/server.ts";
import { BlockInstance } from "../engine/block.ts";

export interface RenderContext {
  routerInfo?: RouterContext;
  warmUpContext?: WarmUpLoadersContext;
}

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

const servePath = (
  routes: [string, Resolvable<Handler>][],
  configs: ResolveOptions,
  flags: Map<string, CookiedFlag>,
  req: Request,
  connInfo: ConnInfo,
  reqUrl: URL,
) =>
async (pathname: string, warmUpOnly = false) => {
  for (const [routePath, handler] of routes) {
    const pattern = new URLPattern({ pathname: routePath });
    const res = pattern.exec(pathname, reqUrl.origin);
    const groups = res?.pathname.groups ?? {};

    if (res !== null) {
      const ctx = { ...connInfo, params: groups } as ConnInfo & {
        params: Record<string, string>;
        state: RenderContext;
      };

      ctx.state.routerInfo = {
        flags: Array.from(flags.keys()).join(","),
        pagePath: routePath,
      };

      ctx.state.warmUpContext = {
        servePath: servePath(
          routes,
          { ...configs, monitoring: undefined, forceFresh: false },
          flags,
          req,
          {
            ...ctx,
            state: {
              ...ctx.state,
              t: undefined, // do not measure timings
            },
          } as ConnInfo,
          reqUrl,
        ),
        warmUpOnly,
      };

      const resolvedOrPromise = context.configResolver!.resolve<Handler>(
        handler,
        { context: ctx, request: req },
        configs,
      );

      const end = configs.monitoring?.t.start("load-data");
      const hand = isAwaitable(resolvedOrPromise)
        ? await resolvedOrPromise
        : resolvedOrPromise;
      end && end();

      return await hand(
        req,
        ctx,
      );
    }
  }
  return new Response(null, {
    status: 404,
  });
};
const router = (
  routes: [string, Resolvable<Handler>][],
  configs: ResolveOptions,
  flags: Map<string, CookiedFlag>,
): Handler => {
  return (req: Request, connInfo: ConnInfo): Promise<Response> => {
    const url = new URL(req.url);
    const serve = servePath(routes, configs, flags, req, connInfo, url);
    return serve(url.pathname);
  };
};

export type MatchWithCookieValue = MatchContext<{
  isMatchFromCookie?: boolean;
}>;

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

    // everyone should come first in the list given that we override the everyone value with the upcoming flags.
    const [routes, overrides] = audiences
      .reduce(
        ([routes, overrides], audience) => {
          // check if the audience matches with the given context considering the `isMatch` provided by the cookies.
          const isMatch = audience.matcher({
            ...matchCtx,
            isMatchFromCookie: isNoCache
              ? undefined
              : flags.get(audience.name)?.isMatch,
          } as MatchWithCookieValue);

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
              value: audience.true,
              updated_at: new Date().toISOString(),
            };
            // set as flag that should be cookied
            flagsThatShouldBeCookied.push(flagValue);
            // set in the current map just in case (duplicated audiences?)
            flags.set(audience.name, flagValue);
          }
          return isMatch
            ? [
              { ...routes, ...audience.true.routes },
              { ...overrides, ...audience.true.overrides },
            ]
            : [routes, overrides];
        },
        [{}, {}] as [
          Record<string, Resolvable<Handler>>,
          Record<string, string>,
        ],
      );
    // build the router from entries
    const builtRoutes = Object.entries(routes).sort((
      [routeStringA],
      [routeStringB],
    ) => rankRoute(routeStringB) - rankRoute(routeStringA));

    const server = router(builtRoutes, {
      overrides,
      monitoring: t ? { t } : undefined,
    }, flags);

    // call the target handler
    const resp = await server(req, connInfo);

    // set cookie for the flags that has changed.
    if (flagsThatShouldBeCookied.length > 0 && resp.status < 300) { // errors and redirects have immutable headers
      cookies.setFlags(resp.headers, flagsThatShouldBeCookied);
      resp.headers.append("vary", "cookie");
    }
    return resp;
  };
}
