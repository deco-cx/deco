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
import { ExtensionFunc } from "../engine/core/resolver.ts";

export type Apps = InstanceOf<AppRuntime, "#/root/apps">;

export type AppManifest = Omit<DecoManifest, "baseUrl" | "islands" | "routes">;

export type AppContext<
  // deno-lint-ignore ban-types
  TState = {},
  TManifest extends AppManifest = AppManifest,
  TDeps extends AppModule[] = [],
> = FnContext<
  TState,
  & TManifest
  & UnionToIntersection<ReturnType<TDeps[number]["default"]>["manifest"]>
>;

/**
 * @icon app-window
 */
export interface App<
  TAppManifest extends AppManifest = AppManifest,
  // deno-lint-ignore ban-types
  TAppState = {},
  TResolvableMap extends ResolvableMap = ResolvableMap,
> {
  resolvables?: TResolvableMap;
  state: TAppState;
  manifest: TAppManifest;
}

export type AppFunc<
  TProps = any,
  // deno-lint-ignore ban-types
  TState = {},
  TAppManifest extends AppManifest = AppManifest,
  TResolverMap extends ResolverMap = ResolverMap,
> = (
  c: TProps,
) => App<TAppManifest, TState, TResolverMap> | AppRuntime;

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
  }: TAppRuntime,
  { resolvers, manifest, resolvables }: TAppRuntime,
): Pick<TAppRuntime, "manifest" | "resolvables" | "resolvers"> => {
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
  { state, manifest, resolvables }: TApp,
): AppRuntime => {
  const injectedManifest = injectAppStateOnManifest(state, manifest);
  return {
    resolvers: resolversFrom<AppManifest, TContext, TResolverMap>(
      injectedManifest,
    ),
    manifest: injectedManifest,
    resolvables,
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
>(props: TProps, extend: ExtensionFunc<TContext>) =>
(
  { default: runtimeFn, dependencies, docCacheFileUrl, name }: TAppModule,
): AppRuntime<TContext, TResolverMap, TResolvableMap> => {
  if (!name) {
    throw new Error(
      "apps without a name are not support yet",
    );
  }
  const runtimes = (dependencies ?? []).map(
    buildApp<TProps, any, TContext, any, any, any>(props, extend),
  );
  // extend using dependencies
  const dependenciesRuntime = runtimes.reduce(
    mergeRuntimes,
    { manifest: {}, resolvables: {}, resolvers: {} } as AppRuntime,
  );
  extend(dependenciesRuntime);

  const appRuntime = runtimeFn(props);
  const currentRuntime = isAppRuntime(appRuntime)
    ? appRuntime
    : buildRuntimeFromApp<TState>(appRuntime);
  const baseKey = import.meta.resolve(`${name}/`);
  const fileUrl = docCacheFileUrl ?? `${baseKey}${DOC_CACHE_FILE_NAME}`;
  hydrateOnce[name] ??= once<void>();
  hydrateOnce[name].do(() => {
    return hydrateDocCacheWith(
      fileUrl.startsWith("file:") ? fromFileUrl(fileUrl) : fileUrl,
      baseKey,
    );
  });
  extend(currentRuntime);

  return mergeRuntimes(currentRuntime, dependenciesRuntime);
};

export interface AppModule<
  TProps = any,
  // deno-lint-ignore ban-types
  TState = {},
  TResolverMap extends ResolverMap = ResolverMap,
  TAppManifest extends AppManifest = AppManifest,
> extends
  BlockModule<
    AppFunc<TProps, TState, TAppManifest, TResolverMap>,
    App<TAppManifest, TState, TResolverMap> | AppRuntime,
    AppRuntime
  > {
  name?: string;
  docCacheFileUrl?: string;
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
  (props: TProps, ctx: BaseContext) => {
    const buildAppWith = buildApp(props, ctx.extend);
    return buildAppWith(mod);
  },
};

/**
 * <TState>(state:TState) => Manifest
 * The app block is used to configure platforms using settings
 */
export default appBlock;
