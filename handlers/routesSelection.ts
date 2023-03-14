import { Flag } from "$live/blocks/flag.ts";
import { Handler } from "$live/blocks/handler.ts";
import { MatchContext, Matcher } from "$live/blocks/matcher.ts";
import { Resolvable } from "$live/engine/core/resolver.ts";
import { isAwaitable } from "$live/engine/core/utils.ts";
import { Audience } from "$live/flags/audience.ts";
import { context } from "$live/live.ts";
import { ConnInfo } from "https://deno.land/std@0.170.0/http/server.ts";
import { router } from "https://deno.land/x/rutt@0.0.13/mod.ts";

export interface SelectionConfig {
  flags: Flag[]; // TODO it should be possible to specify a Flag<T> instead. author Marcos V. Candeia
}

interface AudienceFlag {
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
      0
    );
export default function RoutesSelection({ flags }: SelectionConfig): Handler {
  const audiences = flags.filter(isAudience) as AudienceFlag[];
  return async (req: Request, connInfo: ConnInfo): Promise<Response> => {
    const matchCtx: MatchContext = {
      siteId: context.siteId,
      request: req,
    };

    const [routes, overrides] = audiences.reduce(
      ([routes, overrides], audience) => {
        return audience.matcher(matchCtx)
          ? [
              { ...routes, ...audience.true.routes },
              { ...overrides, ...audience.true.overrides },
            ]
          : [routes, overrides];
      },
      [{}, {}] as [Record<string, Resolvable<Handler>>, Record<string, string>]
    );
    const resolve = context.configResolver!.resolve.bind(
      context.configResolver!
    );
    const routerPromises: Promise<[string, Handler]>[] = [];
    for (const [route, handler] of Object.entries(routes)) {
      const resolvedOrPromise = resolve<Handler>(
        handler,
        { context: connInfo, request: req },
        overrides
      );
      if (isAwaitable(resolvedOrPromise)) {
        routerPromises.push(resolvedOrPromise.then((r) => [route, r]));
      } else {
        routerPromises.push(Promise.resolve([route, resolvedOrPromise]));
      }
    }
    const builtRoutes = Object.fromEntries(
      (await Promise.all(routerPromises)).sort(([routeString]) =>
        rankRoute(routeString)
      )
    );
    const server = router(builtRoutes);
    return await server(req, connInfo);
  };
}
