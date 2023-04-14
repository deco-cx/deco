import { FreshContext } from "$live/engine/fresh/manifest.ts";
import { ResolverMap } from "$live/engine/core/resolver.ts";
import { pickPaths } from "$live/utils/object.ts";
import { DotNestedKeys } from "$live/utils/object.ts";

export default {
  selectKeys: function selectKeys<T>(
    { obj, keys }: { obj: T; keys: DotNestedKeys<T>[] },
  ) {
    if (keys?.length > 0) {
      return pickPaths(obj, keys);
    }
    return obj;
  },
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
} satisfies ResolverMap<FreshContext>;
