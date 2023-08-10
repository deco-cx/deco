// deno-lint-ignore-file no-explicit-any
import { propsLoader } from "$live/blocks/propsLoader.ts";
import { SectionModule } from "$live/blocks/section.ts";
import { FnProps } from "$live/blocks/utils.tsx";
import { Block, BlockModule, InstanceOf } from "$live/engine/block.ts";
import {
  BaseContext,
  ResolvableMap,
  ResolverMap,
} from "$live/engine/core/resolver.ts";
import { mapObjKeys } from "$live/engine/core/utils.ts";
import { resolversFrom } from "$live/engine/fresh/manifest.ts";
import {
  DOC_CACHE_FILE_NAME,
  hydrateDocCacheWith,
} from "$live/engine/schema/docCache.ts";
import { DecoManifest, FnContext } from "$live/types.ts";
import { once, SyncOnce } from "$live/utils/sync.ts";
import { UnionToIntersection } from "https://esm.sh/utility-types@3.10.0";
import { fromFileUrl } from "std/path/mod.ts";

export type Apps = InstanceOf<AppRuntime, "#/root/apps">;

export type AppManifest = Omit<DecoManifest, "baseUrl" | "islands" | "routes">;

export type AppContext<
  // deno-lint-ignore ban-types
  TState = {},
  TManifest extends AppManifest = AppManifest,
  TDeps extends AppModule[] = [],
> = FnContext<
  TState,
  TManifest & UnionToIntersection<TDeps[number]["manifest"]>
>;

/**
 * @icon app-window
 */
export interface App<
  // deno-lint-ignore ban-types
  TAppState = {},
  TResolvableMap extends ResolvableMap = ResolvableMap,
> {
  resolvables?: TResolvableMap;
  state: TAppState;
}

export type AppFunc<
  TProps = any,
  // deno-lint-ignore ban-types
  TState = {},
  TResolverMap extends ResolverMap = ResolverMap,
> = (
  c: TProps,
) => App<TState, TResolverMap>;

export interface AppRuntime<
  TContext extends BaseContext = BaseContext,
  TResolverMap extends ResolverMap<TContext> = ResolverMap<TContext>,
  TResolvableMap extends ResolvableMap<TContext, TResolverMap> = Record<
    string,
    any
  >,
> {
  resolvers: TResolverMap;
  manifest: AppManifest;
  resolvables?: TResolvableMap;
}

type BlockKey = keyof AppManifest;
const mergeManifests = (
  appManifest1: AppManifest,
  appManifest2: AppManifest,
) => {
  const manifestResult = { ...appManifest2, ...appManifest1 };
  for (const [key, value] of Object.entries(appManifest2)) {
    const manifestBlocks = { ...(manifestResult[key as BlockKey] ?? {}) };
    for (const [blockKey, blockFunc] of Object.entries(value)) {
      manifestBlocks[blockKey] = blockFunc;
    }
    manifestResult[key as BlockKey] = manifestBlocks as any;
  }

  return manifestResult;
};

export const mergeRuntimes = (
  {
    resolvers: currentResolvers,
    manifest: currentManifest,
    resolvables: currentResolvables,
  }: AppRuntime,
  { resolvers, manifest, resolvables }: AppRuntime,
): AppRuntime => {
  return {
    manifest: mergeManifests(currentManifest, manifest),
    resolvables: {
      ...currentResolvables,
      ...resolvables,
    },
    resolvers: {
      ...currentResolvers,
      ...resolvers,
    },
  };
};

export const buildApp = <
  TProps = any,
  TState = any,
  TContext extends BaseContext = BaseContext,
  TResolverMap extends ResolverMap<TContext> = ResolverMap<TContext>,
  TResolvableMap extends ResolvableMap<TContext, TResolverMap> = Record<
    string,
    any
  >,
  TAppModule extends AppModule<TProps, TState, TResolvableMap> = AppModule<
    TProps,
    TState,
    TResolvableMap
  >,
>(props: TProps) =>
(
  { default: stateFn, manifest, dependencies, docCacheFileUrl, name }:
    TAppModule,
): AppRuntime<TContext, TResolverMap, TResolvableMap> => {
  if (!name) {
    throw new Error(
      "apps without a name are not support yet",
    );
  }
  const { state, resolvables } = stateFn(props);
  const baseKey = import.meta.resolve(`${name}/`);
  const fileUrl = docCacheFileUrl ?? `${baseKey}${DOC_CACHE_FILE_NAME}`;
  hydrateOnce[name] ??= once<void>();
  hydrateOnce[name].do(() => {
    return hydrateDocCacheWith(
      fileUrl.startsWith("file:") ? fromFileUrl(fileUrl) : fileUrl,
      baseKey,
    );
  });
  const injectedManifest = injectAppStateOnManifest(state, manifest);
  const currentRuntime = {
    resolvers: resolversFrom<AppModule["manifest"], TContext, TResolverMap>(
      injectedManifest,
    ),
    manifest: injectedManifest,
    resolvables,
  };
  const runtimes = (dependencies ?? []).map(
    buildApp<TProps, any, TContext, any, any, any>(props),
  );
  return runtimes.reduce(mergeRuntimes, currentRuntime);
};

export interface AppModule<
  TProps = any,
  // deno-lint-ignore ban-types
  TState = {},
  TResolverMap extends ResolverMap = ResolverMap,
> extends
  BlockModule<
    AppFunc<TProps, TState, TResolverMap>,
    App<TState, TResolverMap>,
    AppRuntime
  > {
  name?: string;
  docCacheFileUrl?: string;
  manifest: AppManifest;
  dependencies?: AppModule<TProps>[];
}

const injectAppState = <TState = any>(
  state: TState,
  fnProps: FnProps,
): FnProps => {
  return (
    props: any,
    request: Request,
    { response, get, invoke }: FnContext,
  ) => {
    return fnProps(props, request, { ...state, response, get, invoke });
  };
};

const injectAppStateOnInlineLoader = <TState = any>(
  state: TState,
  loader: SectionModule["loader"],
): FnProps | undefined => {
  if (!loader) {
    return undefined;
  }
  return (
    props: any,
    request: Request,
    { response, get, invoke }: FnContext,
  ) => {
    return propsLoader(loader, props, request, {
      ...state,
      response,
      get,
      invoke,
    });
  };
};
const injectAppStateOnManifest = <
  TState = any,
  TAppManifest extends AppManifest = AppManifest,
>(state: TState, manifest: TAppManifest): TAppManifest => {
  return {
    ...manifest,
    sections: mapObjKeys(
      manifest.sections ?? {},
      (mod) => ({
        ...mod,
        loader: injectAppStateOnInlineLoader(state, mod.loader),
      }),
    ),
    pages: mapObjKeys(
      manifest.pages ?? {},
      (mod) => ({
        ...mod,
        loader: injectAppStateOnInlineLoader(state, mod.loader),
      }),
    ),
    handlers: mapObjKeys(
      manifest.handlers ?? {},
      (mod) => ({
        ...mod,
        default: (props: unknown, _state: unknown) =>
          mod.default(props, { ..._state ?? {}, ...state }),
      }),
    ),
    actions: mapObjKeys(
      manifest.actions ?? {},
      (mod) => ({ ...mod, default: injectAppState(state, mod.default) }),
    ),
    loaders: mapObjKeys(
      manifest.loaders ?? {},
      (mod) => ({ ...mod, default: injectAppState(state, mod.default) }),
    ),
  };
};

const hydrateOnce: Record<string, SyncOnce<void>> = {};
const appBlock: Block<AppModule> = {
  type: "apps",
  introspect: {
    default: "0",
  },
  adapt: <
    TProps = any,
  >(
    mod: AppModule<TProps>,
  ) =>
  (props: TProps) => {
    const buildAppWith = buildApp(props);
    return buildAppWith(mod);
  },
};

/**
 * <TState>(state:TState) => Manifest
 * The app block is used to configure platforms using settings
 */
export default appBlock;
