// deno-lint-ignore-file no-explicit-any
import { Block, BlockModule } from "../engine/block.ts";
import { BaseContext, Resolver, ResolverMap } from "../engine/core/resolver.ts";
import { mapObjKeys } from "../engine/core/utils.ts";
import {
  INVOKE_PREFIX_KEY,
  PREVIEW_PREFIX_KEY,
} from "../engine/manifest/defaults.ts";
import { DanglingRecover } from "../engine/manifest/manifest.ts";
import { compose, ResolverMiddleware } from "../engine/middleware.ts";
import { AppManifest } from "../mod.ts";
import { usePreviewFunc } from "./utils.tsx";

const resolverIsBlock = (blk: Block) => (resolver: string) => {
  const splitted = resolver.split("/");
  // check if there's any segment on the same name of the block
  return splitted.some((segment) => segment === blk.type); //FIXME (mcandeia) this is not a straightforward solution
};

const asManifest = <TManifest extends AppManifest>(
  d: TManifest,
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
  return wellKnownLocalModules.some((localModule) =>
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

export const resolversFrom = <
  T extends AppManifest,
  TContext extends BaseContext = BaseContext,
  TResolverMap extends ResolverMap<TContext> = ResolverMap<TContext>,
>(
  man: T,
  blocks: Block[],
  middleware?: ResolverMiddleware<TContext> | ResolverMiddleware<TContext>[],
): TResolverMap => {
  const [_, resolvers, __] = (blocks ?? []).reduce(
    (runtime, block) =>
      buildRuntime<AppManifest, TContext, TResolverMap>(
        runtime,
        block,
        middleware,
      ),
    [man, {} as TResolverMap, []] as [
      AppManifest,
      TResolverMap,
      DanglingRecover[],
    ],
  );
  return resolvers;
};
export const buildRuntime = <
  TManifest extends AppManifest,
  TContext extends BaseContext = BaseContext,
  TResolverMap extends ResolverMap<TContext> = ResolverMap<TContext>,
>(
  [currMan, currMap, recovers]: [
    TManifest,
    TResolverMap,
    DanglingRecover[],
  ],
  blk: Block,
  middleware?: ResolverMiddleware | ResolverMiddleware[],
): [
  TManifest,
  TResolverMap,
  DanglingRecover[],
] => {
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
      previewFunc.onBeforeResolveProps = mod.onBeforeResolveProps;
      previewFunc.type = blk.type;
      return { ...prv, [`${PREVIEW_PREFIX_KEY}${key}`]: previewFunc };
    }
    return prv;
  }, {} as TResolverMap);

  const invocations = Object.entries(decorated).reduce(
    (invk, [key, mod]) => {
      const invokeFunc = mod.invoke ?? blk.defaultInvoke;
      if (invokeFunc) {
        invokeFunc.onBeforeResolveProps = mod.onBeforeResolveProps;
        invokeFunc.type = blk.type;
        return { ...invk, [`${INVOKE_PREFIX_KEY}${key}`]: invokeFunc };
      }
      return invk;
    },
    {} as TResolverMap,
  );

  const adapted = blk.adapt
    ? mapObjKeys<Record<string, BlockModule>, Record<string, Resolver>>(
      decorated,
      (mod, key) => {
        const hasMiddleware = typeof middleware !== "undefined";
        // create a middleware array or empty if middleware is not defined
        const middlewares = hasMiddleware
          ? Array.isArray(middleware) ? middleware : [middleware]
          : [];
        const blockResolver = blk.adapt!(mod, key);
        const composed = Array.isArray(blockResolver)
          ? compose(
            ...(hasMiddleware
              ? [...middlewares, ...blockResolver]
              : blockResolver),
          )
          : hasMiddleware
          ? compose(...middlewares, blockResolver)
          : blockResolver;
        composed.onBeforeResolveProps = mod.onBeforeResolveProps;
        composed.type = blk.type;
        return composed;
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
};
