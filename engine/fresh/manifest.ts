// deno-lint-ignore-file no-explicit-any
import { HandlerContext } from "$fresh/server.ts";
import blocks from "$live/blocks/index.ts";
import { Block, BlockModule } from "$live/engine/block.ts";
import { ReleaseResolver } from "$live/engine/core/mod.ts";
import {
  BaseContext,
  DanglingReference,
  Resolvable,
  Resolver,
  ResolverMap,
} from "$live/engine/core/resolver.ts";
import { mapObjKeys, PromiseOrValue } from "$live/engine/core/utils.ts";
import defaultResolvers, {
  INVOKE_PREFIX_KEY,
  PREVIEW_PREFIX_KEY,
} from "$live/engine/fresh/defaults.ts";
import { integrityCheck } from "$live/engine/integrity.ts";
import { compose } from "$live/engine/middleware.ts";
import { getComposedConfigStore } from "$live/engine/releases/provider.ts";
import { context } from "$live/live.ts";
import { DecoManifest, LiveConfig } from "$live/types.ts";

import { usePreviewFunc } from "$live/blocks/utils.ts";
import { SiteInfo } from "$live/types.ts";
import { parse } from "std/flags/mod.ts";
const shouldCheckIntegrity = parse(Deno.args)["check"] === true;

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

const resolverIsBlock = (blk: Block) => (resolver: string) => {
  const splitted = resolver.split("/");
  // check if there's any segment on the same name of the block
  return splitted.some((segment) => segment === blk.type); //FIXME (mcandeia) this is not a straightforward solution
};
const buildDanglingRecover = (recovers: DanglingRecover[]): Resolver => {
  return (parent, ctx) => {
    const curr = ctx.resolveChain.findLast((r) => r.type === "resolver")?.value;

    if (typeof curr !== "string") {
      throw new Error(`Resolver not found ${JSON.stringify(ctx.resolveChain)}`);
    }

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

const asManifest = (
  d: DecoManifest,
): Record<string, Record<string, BlockModule>> =>
  d as unknown as Record<string, Record<string, BlockModule>>;

const danglingModuleTS = "_dangling.ts";
const danglingModuleTSX = "_dangling.tsx";
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

export const $live = <T extends DecoManifest>(
  m: T,
  { siteId, namespace }: SiteInfo,
  useLocalStorageOnly = false,
): T => {
  context.siteId = siteId ?? -1;
  context.namespace = namespace;
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
        const previewFunc = mod.preview ??
          (mod.Preview ? usePreviewFunc(mod.Preview) : blk.defaultPreview);
        if (previewFunc) {
          return { ...prv, [`${PREVIEW_PREFIX_KEY}${key}`]: previewFunc };
        }
        return prv;
      }, {} as ResolverMap<FreshContext>);

      const invocations = Object.entries(decorated).reduce(
        (invk, [key, mod]) => {
          const invokeFunc = mod.invoke ?? blk.defaultInvoke;
          if (invokeFunc) {
            return { ...invk, [`${INVOKE_PREFIX_KEY}${key}`]: invokeFunc };
          }
          return invk;
        },
        {} as ResolverMap<FreshContext>,
      );

      const adapted = blk.adapt
        ? mapObjKeys<Record<string, BlockModule>, Record<string, Resolver>>(
          decorated,
          (mod, key) => {
            const resolver = blk.adapt!(mod, key);
            return Array.isArray(resolver) ? compose(...resolver) : resolver;
          },
        )
        : {}; // if block has no adapt so it's not considered a resolver.
      const recover = adapted[localRef(blk.type, danglingModuleTS)] ??
        adapted[localRef(blk.type, danglingModuleTSX)] ??
        blk.defaultDanglingRecover;
      return [
        { ...currMan, [blk.type]: decorated },
        { ...currMap, ...adapted, ...previews, ...invocations },
        (recover as Resolver | undefined)
          ? [...recovers, {
            recoverable: resolverIsBlock(blk),
            recover,
          } as DanglingRecover]
          : recovers,
      ];
    },
    [m, {}, []] as [DecoManifest, ResolverMap<FreshContext>, DanglingRecover[]],
  );
  context.site = siteName();
  const provider = getComposedConfigStore(
    context.namespace!,
    context.site,
    context.siteId,
    useLocalStorageOnly,
  );
  context.release = provider;
  const resolver = new ReleaseResolver<FreshContext>({
    resolvers: { ...resolvers, ...defaultResolvers },
    getResolvables: (forceFresh?: boolean) => {
      return provider.state({ forceFresh });
    },
    revision: provider.revision.bind(provider),
    danglingRecover: recovers.length > 0
      ? buildDanglingRecover(recovers)
      : undefined,
  });

  if (shouldCheckIntegrity) {
    resolver.getResolvables().then(
      (resolvables: Record<string, Resolvable>) => {
        integrityCheck(resolver.getResolvers(), resolvables);
      },
    );
  }
  // should be set first
  context.releaseResolver = resolver;
  context.manifest = newManifest;
  console.log(
    `Starting live: siteId=${context.siteId} site=${context.site}`,
  );

  return context.manifest as T;
};
