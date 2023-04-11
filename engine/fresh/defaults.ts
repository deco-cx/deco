import { FreshContext } from "$live/engine/fresh/manifest.ts";
import { ResolverMap } from "$live/engine/core/resolver.ts";

export default {
  runWithMergedProps: function runWithMergedProps(
    { props, resolveType }, // wishListVtex deco-sites/std/vtexProductList.ts
    { resolvables, resolvers, resolve },
  ) {
    const resolver = resolvers[resolveType];
    if (!resolver) {
      const resolvable = resolvables[resolveType];
      if (!resolvable) {
        return {
          ...props,
          __resolveType: resolveType,
        };
      }
      const { __resolveType, ...savedprops } = resolvable;
      // recursive call
      return resolve({
        __resolveType: "runWithMergedProps",
        props: {
          ...savedprops,
          ...props,
        },
        resolveType: __resolveType,
      });
    }
    return resolve({
      ...props,
      __resolveType: resolveType,
    });
  },
  fromParams: function fromParams({ param }, { context: { params } }) {
    return params[param];
  },
} as ResolverMap<FreshContext>;
