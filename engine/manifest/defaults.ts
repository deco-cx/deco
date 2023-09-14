import PreviewNotAvailable from "../../components/PreviewNotAvailable.tsx";
import {
  BaseContext,
  isResolvable,
  Resolvable,
  Resolver,
  ResolverMap,
} from "../../engine/core/resolver.ts";
import { DotNestedKeys, pickPaths } from "../../utils/object.ts";
import { HttpError } from "../errors.ts";

export const PREVIEW_PREFIX_KEY = "Preview@";
export const INVOKE_PREFIX_KEY = "Invoke@";

const MAX_SELECT_BLOCK_DEPTH = 10;
// deno-lint-ignore no-explicit-any
export interface BlockInvocation<TProps = any> {
  block: string;
  props: TProps;
  source?: "internal" | "external";
}
export default {
  state: function state(_props, { resolvables, resolvers }) {
    return {
      resolvables,
      resolvers,
    };
  },
  resolvables: function resolvables(_props, { resolvables }) {
    return resolvables;
  },
  resolvers: function resolvers(_props, { resolvers }) {
    return resolvers;
  },
  once: function once({ key, func }, { runOnce }) {
    return runOnce(func.name ?? key, func);
  },
  blockSelector: function blockSelector(
    { type }: { type: string },
    { resolvables, runOnce, resolvers },
  ) {
    return runOnce(`selector_${type}`, () => {
      const blocks: Record<string, Resolvable> = {};
      for (const [key, value] of Object.entries(resolvables)) {
        if (!isResolvable(value)) {
          continue;
        }
        let resolver: Resolver | undefined = undefined;
        let currentResolveType = value.__resolveType;
        for (let i = 0; i < MAX_SELECT_BLOCK_DEPTH; i++) {
          resolver = resolvers[currentResolveType];
          if (resolver !== undefined) {
            break;
          }
          const resolvable = resolvables[currentResolveType];
          if (!resolvable || !isResolvable(resolvable)) {
            break;
          }
          currentResolveType = resolvable.__resolveType;
        }
        if (resolver !== undefined && resolver.type === type) {
          blocks[key] = value;
        }
      }
      return blocks;
    });
  },
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
    ctx: BaseContext,
  ) => {
    if (props?.deferred && props?.data) {
      const deferred = (tCtx: Partial<BaseContext>) =>
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
    { props, block, source }: BlockInvocation, // wishListVtex deco-sites/std/vtexProductList.ts
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
          source,
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
} satisfies ResolverMap<BaseContext>;
