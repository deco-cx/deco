import { FreshContext } from "$live/engine/fresh/manifest.ts";
import { ResolverMap } from "$live/engine/core/resolver.ts";

export default {
  fromParams: function fromParams({ param }, { context: { params } }) {
    return params[param];
  },
} as ResolverMap<FreshContext>;
