// deno-lint-ignore-file no-explicit-any ban-types
import { propsLoader } from "$live/blocks/propsLoader.ts";
import { SectionModule } from "$live/blocks/section.ts";
import { FnProps } from "$live/blocks/utils.tsx";
import { Block, BlockModule, InstanceOf } from "$live/engine/block.ts";
import {
  BaseContext,
  ExtensionFunc,
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
import { fromFileUrl } from "std/path/mod.ts";

export type Apps = InstanceOf<AppRuntime, "#/root/apps">;

export type AppManifest = Omit<DecoManifest, "baseUrl" | "islands" | "routes">;

export type AppContext<
  TApp extends App,
  TDependantManifest = TApp extends
    { dependencies?: ({ manifest: infer TManifestDependency })[] }
    ? TManifestDependency extends AppManifest ? TManifestDependency : {}
    : {},
> = FnContext<
  TApp["state"],
  & TApp["manifest"]
  & TDependantManifest
>;

export type AppFunc<
  TProps = any,
  TState = {},
  TAppManifest extends AppManifest = AppManifest,
  TAppDependencies extends (AppRuntime | App)[] = (AppRuntime | App)[],
  TResolverMap extends ResolverMap = ResolverMap,
> = (
  c: TProps,
) => App<TAppManifest, TState, TAppDependencies, TResolverMap> | AppRuntime;

export interface AppBase<
  TAppManifest extends AppManifest = AppManifest,
  TAppDependencies extends (AppRuntime | App)[] = any,
  TResolvableMap extends ResolvableMap = ResolvableMap,
> {
  name: string;
  docCacheFileUrl?: string;
  resolvables?: TResolvableMap;
  manifest: TAppManifest;
  dependencies?: TAppDependencies;
}

/**
 * @icon app-window
 */
export interface App<
  TAppManifest extends AppManifest = AppManifest,
  TAppState = {},
  TAppDependencies extends (AppRuntime | App)[] = any,
  TResolvableMap extends ResolvableMap = ResolvableMap,
> extends AppBase<TAppManifest, TAppDependencies, TResolvableMap> {
  state: TAppState;
}

export interface AppRuntime<
  TContext extends BaseContext = BaseContext,
  TResolverMap extends ResolverMap<TContext> = ResolverMap<TContext>,
  TResolvableMap extends ResolvableMap<TContext, TResolverMap> = Record<
    string,
    any
  >,
  TAppDependencies extends (AppRuntime | App)[] = any,
  TAppManifest extends AppManifest = AppManifest,
> extends AppBase<TAppManifest, TAppDependencies, TResolvableMap> {
  resolvers: TResolverMap;
}

type BlockKey = keyof AppManifest;
export const mergeManifests = (
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

export const mergeRuntimes = <TAppRuntime extends AppRuntime = AppRuntime>(
  {
    resolvers: currentResolvers,
    manifest: currentManifest,
    resolvables: currentResolvables,
    name,
  }: TAppRuntime,
  { resolvers, manifest, resolvables }: TAppRuntime,
): Pick<TAppRuntime, "manifest" | "resolvables" | "resolvers" | "name"> => {
  return {
    name,
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

const isAppRuntime = <
  TState,
  TApp extends App<any, TState> = App<any, TState>,
  TAppRuntime extends AppRuntime = AppRuntime,
>(
  app: TApp | TAppRuntime,
): app is TAppRuntime => {
  return (app as TAppRuntime)?.resolvers !== undefined;
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

const buildRuntimeFromApp = <
  TState,
  TApp extends App<any, TState> = App<any, TState>,
  TContext extends BaseContext = BaseContext,
  TResolverMap extends ResolverMap = ResolverMap,
>(
  { state, manifest, resolvables, dependencies, name }: TApp,
): AppRuntime => {
  const injectedManifest = injectAppStateOnManifest(state, manifest);
  return {
    name,
    resolvers: resolversFrom<AppManifest, TContext, TResolverMap>(
      injectedManifest,
    ),
    manifest: injectedManifest,
    resolvables,
    dependencies,
  };
};

export type AppModule<
  TState = {},
  TProps = any,
  TResolverMap extends ResolverMap = ResolverMap,
  TAppManifest extends AppManifest = AppManifest,
  TAppDependencies extends (AppRuntime | App)[] = (AppRuntime | App)[],
> = BlockModule<
  AppFunc<TProps, TState, TAppManifest, TAppDependencies, TResolverMap>,
  App<TAppManifest, TState, TAppDependencies, TResolverMap> | AppRuntime,
  AppRuntime
>;

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

const buildApp = (extend: ExtensionFunc) =>
<TState = {}>(
  appRuntime: AppRuntime | App<any, TState>,
): AppRuntime => {
  const runtime = isAppRuntime(appRuntime)
    ? appRuntime
    : buildRuntimeFromApp<TState>(appRuntime);
  const { name, docCacheFileUrl } = appRuntime;
  const baseKey = import.meta.resolve(`${name}/`);
  const fileUrl = docCacheFileUrl ?? `${baseKey}${DOC_CACHE_FILE_NAME}`;
  hydrateOnce[name] ??= once<void>();
  hydrateOnce[name].do(() => {
    return hydrateDocCacheWith(
      fileUrl.startsWith("file:") ? fromFileUrl(fileUrl) : fileUrl,
      baseKey,
    );
  });
  const dependencies: AppRuntime[] = (runtime.dependencies ?? []).map(
    buildApp(extend),
  );
  extend(runtime);
  return dependencies.reduce(mergeRuntimes, runtime);
};
const hydrateOnce: Record<string, SyncOnce<void>> = {};
const appBlock: Block<AppModule> = {
  type: "apps",
  adapt: <
    TProps = any,
    TState = {},
  >(
    { default: runtimeFn }: AppModule<TState, TProps>,
  ) =>
  (props: TProps, ctx: BaseContext) => {
    const appRuntime = runtimeFn(props);
    const buildAppWith = buildApp(ctx.extend);
    return buildAppWith(appRuntime);
  },
};

/**
 * <TState>(state:TState) => Manifest
 * The app block is used to configure platforms using settings
 */
export default appBlock;
