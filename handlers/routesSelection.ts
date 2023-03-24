import { Flag } from "$live/blocks/flag.ts";
import { MatchContext, Matcher } from "$live/blocks/matcher.ts";
import { ResolveOptions } from "$live/engine/core/mod.ts";
import { Resolvable } from "$live/engine/core/resolver.ts";
import { isAwaitable } from "$live/engine/core/utils.ts";
import { CookiedFlag, cookies } from "$live/flags.ts";
import { Audience } from "$live/flags/audience.ts";
import { isFreshCtx } from "$live/handlers/fresh.ts";
import { context } from "$live/live.ts";
import MatchAlways from "$live/matchers/MatchAlways.ts";
import { LiveState, Page } from "$live/types.ts";
import { ConnInfo, Handler } from "std/http/server.ts";

export interface SelectionConfig {
  flags: Flag[]; // TODO it should be possible to specify a Flag<T> instead. author Marcos V. Candeia
}

interface AudienceFlag {
  name: string;
  matcher: Matcher;
  true: Pick<Audience, "routes" | "overrides">;
}

const isAudience = (f: Flag | AudienceFlag): f is AudienceFlag => {
  return (
    (f as AudienceFlag).true?.routes !== undefined ||
    (f as AudienceFlag).true?.overrides !== undefined
  );
};

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

const router = (
  routes: [string, Resolvable<Handler>][],
  configs: ResolveOptions,
): Handler => {
  return async (req: Request, connInfo: ConnInfo): Promise<Response> => {
    for (const [routePath, handler] of routes) {
      const pattern = new URLPattern({ pathname: routePath });
      const res = pattern.exec(req.url);
      const groups = res?.pathname.groups ?? {};

      if (res !== null) {
        const ctx = { ...connInfo, params: groups } as ConnInfo & {
          params: Record<string, string>;
        };
        const resolvedOrPromise = context.configResolver!.resolve<Handler>(
          handler,
          { context: ctx, request: req },
          configs,
        );

        const hand = isAwaitable(resolvedOrPromise)
          ? await resolvedOrPromise
          : resolvedOrPromise;

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
};

export type MatchWithCookieValue = MatchContext<{
  isMatchFromCookie?: boolean;
}>;

// when used ?pageId=x&pathTemplate=y it forces a page to be used
const forcePageAudience = (
  req: Request,
  configs: ResolveOptions,
): AudienceFlag | undefined => {
  const reqUrl = new URL(req.url);
  const pageId = reqUrl.searchParams.get("pageId");
  if (!pageId) {
    return undefined;
  }
  const pageTemplate = reqUrl.searchParams.get("pathTemplate") ?? "/*";
  return {
    name: `force_${pageId}`,
    matcher: MatchAlways,
    true: {
      routes: {
        [pageTemplate]: async (req: Request, ctx: ConnInfo) => {
          if (!isFreshCtx(ctx)) {
            return Response.error();
          }
          const resolvedOrPromise = context.configResolver!.resolve<Page>(
            pageId,
            { context: ctx, request: req },
            configs,
          );

          const page = isAwaitable(resolvedOrPromise)
            ? await resolvedOrPromise
            : resolvedOrPromise;

          if (!page) {
            return new Response(null, { status: 404 });
          }
          return ctx.render({ page });
        },
      },
    },
  };
};
export default function RoutesSelection({ flags }: SelectionConfig): Handler {
  const audiences = flags.filter(isAudience) as AudienceFlag[];
  return async (req: Request, connInfo: ConnInfo): Promise<Response> => {
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

    // reduce audiences building the routes and the overrides.
    const pageAudience = forcePageAudience(req, {
      monitoring: t ? { t } : undefined,
    });
    const [routes, overrides] = (pageAudience ? [pageAudience] : audiences)
      .reduce(
        ([routes, overrides], audience) => {
          // check if the audience matches with the given context considering the `isMatch` provided by the cookies.
          const isMatch = audience.matcher({
            ...matchCtx,
            isMatchFromCookie: flags.get(audience.name)?.isMatch,
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
    });

    // call the target handler
    const resp = await server(req, connInfo);

    // set cookie for the flags that has changed.
    if (flagsThatShouldBeCookied.length > 0) {
      cookies.setFlags(resp.headers, flagsThatShouldBeCookied);
      resp.headers.append("vary", "cookie");
    }
    return resp;
  };
}
