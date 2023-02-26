import { Resolvable, ResolverMap } from "$live/engine/core/resolver.ts";
import { PromiseOrValue } from "$live/engine/core/utils.ts";
import { Publication } from "$live/types.ts";
import { router } from "https://deno.land/x/rutt@0.0.13/mod.ts";
import { FreshContext } from "./manifest.ts";

export default {
  RoutesSelection: function RoutesSelection(
    publications: Record<string, Publication>,
  ) {
    const pubArray: Publication[] = Array.from({
      ...publications,
      length: Object.keys(publications).length,
    });
    return pubArray.reduce((entrypoints, pub) => {
      return pub.active ? { ...entrypoints, ...pub.entrypoints } : entrypoints;
    }, {});
  },
  Router: function Router(
    {
      base,
      entrypoints,
    }: {
      base?: string;
      entrypoints: Record<string, Resolvable<PromiseOrValue<Response>>>;
    },
    { resolve, context, request },
  ) {
    let routes = {};

    for (const [entrypoint, resolvable] of Object.entries(entrypoints)) {
      routes = {
        ...routes,
        [`${base}${entrypoint}`]: () => resolve(resolvable),
      };
    }
    const serve = router(routes);
    return serve(request, context);
  },
  Fresh: function Fresh(component, ctx) {
    return ctx.context.render(component);
  },
  fromParams: function fromParams({ param }, { context: { params } }) {
    return params[param];
  },
  JSON: function JSON({ status, body, headers }) {
    return Response.json(body, {
      headers,
      status,
    });
  },
} as ResolverMap<FreshContext>;
