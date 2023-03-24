// deno-lint-ignore-file no-explicit-any
import { HandlerContext } from "$fresh/server.ts";
import { LiveConfig } from "$live/blocks/handler.ts";
import blocks from "$live/blocks/index.ts";
import { BlockModule, PreactComponent } from "$live/engine/block.ts";
import { ConfigStore } from "$live/engine/configstore/provider.ts";
import {
  newSupabaseDeploy,
  newSupabaseLocal,
} from "$live/engine/configstore/supabase.ts";
import {
  newSupabaseProviderLegacyDeploy,
  newSupabaseProviderLegacyLocal,
} from "$live/engine/configstore/supabaseLegacy.ts";
import { ConfigResolver } from "$live/engine/core/mod.ts";
import {
  BaseContext,
  DanglingReference,
  Resolver,
  ResolverMap,
} from "$live/engine/core/resolver.ts";
import { mapObjKeys, PromiseOrValue } from "$live/engine/core/utils.ts";
import defaultResolvers from "$live/engine/fresh/defaults.ts";
import { compose } from "$live/engine/middleware.ts";
import { context } from "$live/live.ts";
import { DecoManifest } from "$live/types.ts";

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

interface DanglingRecover {
  recoverable: (type: string) => boolean;
  recover: Resolver;
}

const buildDanglingRecover = (recovers: DanglingRecover[]): Resolver => {
  return (parent, ctx) => {
    const curr = ctx.resolveChain[ctx.resolveChain.length - 1];
    for (const { recoverable, recover } of recovers) {
      if (recoverable(curr)) {
        return recover(parent, ctx);
      }
    }
    throw new DanglingReference(curr);
  };
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

const danglingModuleTS = "__dangling.ts";
const danglingModuleTSX = "__dangling.tsx";
const wellKnownLocalModules = [
  danglingModuleTS,
  danglingModuleTSX,
];

export const wellKnownLocalMappings: Record<string, string> = {
  [danglingModuleTS]: danglingModuleTS,
  [danglingModuleTSX]: danglingModuleTSX,
};

const localRef = (blkType: string, ref: string) => `./${blkType}/${ref}`;
export const shouldBeLocal = (block: string, ref: string): boolean => {
  return block === "routes" || block === "islands" || // islands and routes are always local
    wellKnownLocalModules.some((localModule) =>
      localRef(block, localModule) === ref
    );
};

export const withoutLocalModules = (
  block: string,
  r: Record<string, any>,
): Record<string, any> => {
  for (const moduleName of wellKnownLocalModules) {
    delete r[localRef(block, moduleName)];
  }
  return r;
};

const getProvider = (): ConfigStore => {
  const isLegacy = context.siteId > 0;
  if (isLegacy) {
    const provider = context.isDeploy
      ? newSupabaseProviderLegacyDeploy
      : newSupabaseProviderLegacyLocal;
    return provider(context.siteId, context.namespace!);
  }
  // set as migrated
  context.metadata["migrated"] = true;
  const provider = context.isDeploy ? newSupabaseDeploy : newSupabaseLocal;
  return provider(context.site);
};
export const $live = <T extends DecoManifest>(m: T): T => {
  const [newManifest, resolvers, recovers] = (blocks ?? []).reduce(
    ([currMan, currMap, recovers], blk) => {
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
          (mod, key) => {
            const resolver = blk.adapt!(mod, key);
            return Array.isArray(resolver) ? compose(...resolver) : resolver;
          },
        )
        : {}; // if block has no adapt so it's not considered a resolver.
      return [
        { ...currMan, [blk.type]: decorated },
        { ...currMap, ...adapted, ...previews },
        blk.defaultDanglingRecover
          ? [...recovers, {
            recoverable: (type: string) => {
              const splitted = type.split("/");
              // check if there's any segment on the same name of the block
              return splitted.some((segment) => segment === blk.type); //FIXME (mcandeia) this is not a straightforward solution
            },
            recover: adapted[localRef(blk.type, danglingModuleTS)] ??
              adapted[localRef(blk.type, danglingModuleTSX)] ??
              blk.defaultDanglingRecover,
          } as DanglingRecover]
          : recovers,
      ];
    },
    [m, {}, []] as [DecoManifest, ResolverMap<FreshContext>, DanglingRecover[]],
  );
  context.site = siteName();
  const provider = getProvider();
  const resolver = new ConfigResolver<FreshContext>({
    resolvers: { ...resolvers, ...defaultResolvers, preview },
    getResolvables: provider.get.bind(provider),
    danglingRecover: recovers.length > 0
      ? buildDanglingRecover(recovers)
      : undefined,
  });
  // should be set first
  context.configResolver = resolver;
  context.manifest = newManifest;
  console.log(
    `Starting live: siteId=${context.siteId} site=${context.site}`,
  );

  return context.manifest as T;
};
