import { ResolverMap } from "$live/engine/core/resolver.ts";
import { FreshContext } from "./manifest.ts";

export default {
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
