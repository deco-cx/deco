// deno-lint-ignore-file no-explicit-any
import { HandlerContext } from "$fresh/server.ts";
import { LiveConfig } from "$live/blocks/handler.ts";
import blocks from "$live/blocks/index.ts";
import { BlockModule, PreactComponent } from "$live/engine/block.ts";
import { ConfigResolver } from "$live/engine/core/mod.ts";
import {
  BaseContext,
  Resolver,
  ResolverMap,
} from "$live/engine/core/resolver.ts";
import { mapObjKeys, PromiseOrValue } from "$live/engine/core/utils.ts";
import defaultResolvers from "$live/engine/fresh/defaults.ts";
import { context } from "$live/live.ts";
import { DecoManifest } from "$live/types.ts";
import { newSupabaseProviderLegacy } from "$live/engine/fresh/supabase.ts";

const ENV_SITE_NAME = "DECO_SITE_NAME";

export type FreshHandler<
  TConfig = any,
  TData = any,
  TState = any,
  Resp = Response,
> = (
  request: Request,
  ctx: HandlerContext<TData, LiveConfig<TState, TConfig>>,
) => PromiseOrValue<Resp>;

export interface FreshContext<Data = any, State = any, TConfig = any>
  extends BaseContext {
  context: HandlerContext<Data, LiveConfig<State, TConfig>>;
  request: Request;
}

export type LiveState<T, TState = unknown> = TState & {
  $live: T;
};

const siteName = (): string => {
  const siteNameFromEnv = Deno.env.get(ENV_SITE_NAME);
  if (siteNameFromEnv) {
    return siteNameFromEnv;
  }
  const [_, siteName] = context.namespace!.split("/"); // deco-sites/std best effort
  return siteName;
};

const previewPrefixKey = "Preview@";
const preview: Resolver<PreactComponent> = async (
  { block, props }: { block: string; props: any },
  { resolvables, resolvers, resolve },
) => {
  const pvResolver = `${previewPrefixKey}${block}`;
  const previewResolver = resolvers[pvResolver];
  if (!previewResolver) {
    const resolvable = resolvables[block];
    if (!resolvable) {
      throw new Error(`${block} preview not available`);
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
};
const asManifest = (
  d: DecoManifest,
): Record<string, Record<string, BlockModule>> =>
  d as unknown as Record<string, Record<string, BlockModule>>;
export const $live = <T extends DecoManifest>(m: T): T => {
  const [newManifest, resolvers] = (blocks ?? []).reduce(
    ([currMan, currMap], blk) => {
      const blocks = asManifest(currMan)[blk.type] ?? {};
      const decorated: Record<string, BlockModule> = blk.decorate
        ? mapObjKeys<Record<string, BlockModule>, Record<string, BlockModule>>(
          blocks,
          blk.decorate,
        )
        : blocks;

      const previews = Object.entries(decorated).reduce((prv, [key, mod]) => {
        const previewFunc = mod.preview ?? blk.defaultPreview;
        if (previewFunc) {
          return { ...prv, [`${previewPrefixKey}${key}`]: previewFunc };
        }
        return prv;
      }, {} as ResolverMap<FreshContext>);

      const adapted = blk.adapt
        ? mapObjKeys<Record<string, BlockModule>, Record<string, Resolver>>(
          decorated,
          blk.adapt,
        )
        : {}; // if block has no adapt so it's not considered a resolver.
      return [
        { ...currMan, [blk.type]: decorated },
        { ...currMap, ...adapted, ...previews },
      ];
    },
    [m, {}] as [DecoManifest, ResolverMap<FreshContext>],
  );
  context.site = siteName();
  const provider = newSupabaseProviderLegacy(
    context.siteId,
    context.namespace!,
  );
  const resolver = new ConfigResolver<FreshContext>({
    resolvers: { ...resolvers, ...defaultResolvers, preview },
    resolvables: provider.get(),
  });
  provider.onChange(() => resolver.setResolvables(provider.get()));
  // should be set first
  context.configResolver = resolver;
  context.manifest = newManifest;

  return context.manifest as T;
};
