import { ResolverMap } from "$live/engine/core/resolver.ts";
import { Publication } from "$live/types.ts";
import { FreshContext } from "$live/engine/adapters/fresh/manifest.ts";

export default {
  RoutesSelection: function RoutesSelection(
    publications: Record<string, Publication>
  ) {
    const pubArray: Publication[] = Array.from({
      ...publications,
      length: Object.keys(publications).length,
    });
    return pubArray.reduce((entrypoints, pub) => {
      return pub.active ? { ...entrypoints, ...pub.entrypoints } : entrypoints;
    }, {});
  },
  fromParams: function fromParams({ param }, { context: { params } }) {
    return params[param];
  },
} as ResolverMap<FreshContext>;
