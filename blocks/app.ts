// deno-lint-ignore-file no-explicit-any ban-types
import { dirname } from "std/path/mod.ts";
import { propsLoader } from "../blocks/propsLoader.ts";
import { SectionModule } from "../blocks/section.ts";
import { FnProps } from "../blocks/utils.tsx";
import { Block, BlockModule, InstanceOf } from "../engine/block.ts";
import {
  BaseContext,
  ExtensionFunc,
  ResolvableMap,
  ResolverMap,
} from "../engine/core/resolver.ts";
import { mapObjKeys } from "../engine/core/utils.ts";
import { resolversFrom } from "../engine/fresh/manifest.ts";
import { DecoManifest, FnContext } from "../types.ts";

export type Apps = InstanceOf<AppRuntimeWithMeta, "#/root/apps">;
export type SourceMap = Record<string, string>;
export interface AppRuntimeWithMeta extends AppRuntime {
  sourceMap: SourceMap;
}
export type AppManifest = Omit<DecoManifest, "islands" | "routes">;

export type ManifestOf<TApp extends App> =
  & TApp["manifest"]
  & (TApp extends { dependencies?: (infer Depedendency)[] }
    ? Depedendency extends App ? ManifestOf<Depedendency> : {}
    : {});

export type AppContext<
  TApp extends App,
> = FnContext<
  TApp["state"],
  ManifestOf<TApp>
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

type BlockKey = keyof Omit<AppManifest, "baseUrl" | "name">;

export const buildSourceMap = (manifest: AppManifest): SourceMap => {
  const sourceMap: SourceMap = {};
  const { baseUrl, name, ...appManifest } = manifest;
  for (const value of Object.values(appManifest)) {
    for (const blockKey of Object.keys(value)) {
      sourceMap[blockKey] = blockKey.replace(name, dirname(baseUrl));
    }
  }

  return sourceMap;
};

export const mergeManifests = (
  [current, sourceMap]: [AppManifest, SourceMap],
  manifest: AppManifest,
): [AppManifest, SourceMap] => {
  const manifestResult = { ...manifest, ...current };
  const { baseUrl, name, ...appManifest } = manifest;
  for (const [key, value] of Object.entries(appManifest)) {
    const manifestBlocks = { ...(manifestResult[key as BlockKey] ?? {}) };
    for (const [blockKey, blockFunc] of Object.entries(value)) {
      manifestBlocks[blockKey] = blockFunc;
      if (baseUrl) {
        sourceMap[blockKey] = blockKey.replace(name, dirname(baseUrl));
      }
    }
    manifestResult[key as BlockKey] = manifestBlocks as any;
  }

  return [manifestResult, sourceMap];
};

export const mergeRuntimes = <
  TAppRuntime extends AppRuntimeWithMeta = AppRuntimeWithMeta,
>(
  {
    resolvers: currentResolvers,
    manifest: currentManifest,
    resolvables: currentResolvables,
    sourceMap,
  }: TAppRuntime,
  { resolvers, manifest, resolvables }: AppRuntime,
): Pick<
  TAppRuntime,
  "manifest" | "resolvables" | "resolvers" | "sourceMap"
> => {
  const [mergedManifest, newSourceMap] = mergeManifests([
    currentManifest,
    sourceMap,
  ], manifest);
  return {
    manifest: mergedManifest,
    resolvables: {
      ...currentResolvables,
      ...resolvables,
    },
    resolvers: {
      ...currentResolvers,
      ...resolvers,
    },
    sourceMap: newSourceMap,
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
  { state, manifest, resolvables, dependencies }: TApp,
): AppRuntime => {
  const injectedManifest = injectAppStateOnManifest(state, manifest);
  return {
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
  const dependencies: AppRuntime[] = (runtime.dependencies ?? []).map(
    buildApp(extend),
  );
  extend(runtime);
  return [...dependencies, runtime].reduce(
    mergeRuntimes,
    { ...runtime, sourceMap: {} },
  );
};
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
