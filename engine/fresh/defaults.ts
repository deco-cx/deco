import { ResolverMap } from "$live/engine/core/resolver.ts";
import { FreshContext } from "$live/engine/fresh/manifest.ts";
import { DotNestedKeys, pickPaths } from "$live/utils/object.ts";
import PreviewNotAvailable from "../../components/PreviewNotAvailable.tsx";

export const PREVIEW_PREFIX_KEY = "Preview@";
export const INVOKE_PREFIX_KEY = "Invoke@";

// deno-lint-ignore no-explicit-any
export interface BlockInvocation<TProps = any> {
  block: string;
  props: TProps;
}
export default {
  selectKeys: function selectKeys<T>(
    { obj, keys }: { obj: T; keys: DotNestedKeys<T>[] },
  ) {
    if (keys?.length > 0) {
      return pickPaths(obj, keys);
    }
    return obj;
  },
  preview: async (
    { block, props }: BlockInvocation,
    { resolvables, resolvers, resolve },
  ) => {
    const pvResolver = `${PREVIEW_PREFIX_KEY}${block}`;
    const previewResolver = resolvers[pvResolver];
    if (!previewResolver) {
      const resolvable = resolvables[block];
      if (!resolvable) {
        return { Component: PreviewNotAvailable, props: { block } };
      }
      const { __resolveType, ...resolvableProps } = resolvable;
      // recursive call
      return resolve({
        __resolveType: "preview",
        props: {
          ...props,
          ...resolvableProps,
        },
        block: __resolveType,
      });
    }
    return resolve({
      __resolveType: pvResolver,
      ...(await resolve({ __resolveType: block, ...props })),
    });
  },
  invoke: function invoke(
    { props, block }: BlockInvocation, // wishListVtex deco-sites/std/vtexProductList.ts
    { resolvables, resolvers, resolve },
  ) {
    const invokeBlock = `${INVOKE_PREFIX_KEY}${block}`;
    const _invokeResolver = resolvers[invokeBlock];
    const [resolver, __resolveType] = _invokeResolver
      ? [_invokeResolver, invokeBlock]
      : [
        resolvers[block],
        block,
      ];
    if (!resolver) {
      const resolvable = resolvables[block];
      if (!resolvable) {
        return {
          ...props,
          __resolveType: block,
        };
      }
      const { __resolveType, ...savedprops } = resolvable;
      // recursive call
      return resolve({
        __resolveType: "invoke",
        props: {
          ...savedprops,
          ...props,
        },
        block: __resolveType,
      });
    }
    return resolve({
      ...props,
      __resolveType,
    });
  },
  fromParams: function fromParams({ param }, { context: { params } }) {
    return params[param];
  },
} satisfies ResolverMap<FreshContext>;
