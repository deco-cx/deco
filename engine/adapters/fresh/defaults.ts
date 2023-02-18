import { FreshContext } from "$live/engine/adapters/fresh/adapters.ts";
import { ResolverMap } from "$live/engine/core/resolver.ts";

export default {
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
