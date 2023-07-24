import { isResolvable, ResolverMap } from "$live/engine/core/resolver.ts";
import { FreshContext } from "$live/engine/fresh/manifest.ts";
import { DotNestedKeys, pickPaths } from "$live/utils/object.ts";
import PreviewNotAvailable from "../../components/PreviewNotAvailable.tsx";
import { HttpError } from "../errors.ts";

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
  mergeProps: <T>({ props }: { props: Partial<T>[] }) => {
    let result = {};
    for (const prop of props) {
      result = { ...result, ...prop };
    }
    return result;
  },
  resolved: <T, R extends { data: T; deferred?: boolean }>(
    props: R,
    ctx: FreshContext,
  ) => {
    if (props?.deferred && props?.data) {
      const deferred = (tCtx: Partial<FreshContext>) =>
        ctx.resolve(
          props?.data,
          { resolveChain: ctx.resolveChain },
          tCtx ?? {},
        );
      deferred._deferred = true;
      deferred.__resolveType = isResolvable(props?.data)
        ? props?.data?.__resolveType
        : undefined;
      return deferred;
    }
    return props?.data;
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
      const resolvablePvResolverKey = `${PREVIEW_PREFIX_KEY}${__resolveType}`;
      if (!resolvers[resolvablePvResolverKey]) {
        return {
          Component: PreviewNotAvailable,
          props: { block: __resolveType },
        };
      }
      const resolvedSavedProps = Object.keys(resolvableProps ?? {}).length > 0
        ? await resolve(resolvableProps)
        : resolvableProps;
      return resolve({
        __resolveType: resolvablePvResolverKey,
        ...(await resolve({
          __resolveType: __resolveType,
          ...resolvedSavedProps,
          ...props,
        }, { propsIsResolved: true })),
      }, { propsIsResolved: true });
    }
    return resolve({
      __resolveType: pvResolver,
      ...(await resolve({ __resolveType: block, ...props }, {
        propsIsResolved: true,
      })),
    }, { propsIsResolved: true });
  },
  invoke: async function invoke(
    { props, block }: BlockInvocation, // wishListVtex deco-sites/std/vtexProductList.ts
    { resolvables, resolvers, resolve },
  ) {
    try {
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
        return await resolve({
          __resolveType: "invoke",
          props: {
            props: [{ __resolveType: "resolved", data: props }, savedprops],
            __resolveType: "mergeProps",
          },
          block: __resolveType,
        });
      }
      return await resolve({
        ...props,
        __resolveType,
      }, { propsIsResolved: true });
    } catch (err) {
      if (!(err instanceof HttpError)) {
        throw new HttpError(
          new Response(
            err ? JSON.stringify(err) : JSON.stringify({
              message: "Something went wrong.",
              code: "SWW",
            }),
            {
              status: 500,
              headers: {
                "content-type": "application/json",
              },
            },
          ),
        );
      }
      throw err;
    }
  },
  fromParams: function fromParams({ param }, { context: { params } }) {
    return params[param];
  },
} satisfies ResolverMap<FreshContext>;
