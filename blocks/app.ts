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
import { fromFileUrl } from "std/path/mod.ts";

export type Apps = InstanceOf<typeof appBlock, "#/root/apps">;

export type AppManifest = Omit<DecoManifest, "baseUrl" | "islands" | "routes">;

/**
 * @icon app-window
 */
export interface App<
  TAppManifest extends AppManifest = AppManifest,
  // deno-lint-ignore ban-types
  TAppState = {},
> {
  manifest: TAppManifest;
  state: TAppState;
}

export type AppContext<TApp extends App = App> = FnContext<
  TApp["state"],
  TApp["manifest"]
>;

export type AppFunc<
  TProps = any,
  TAppManifest extends AppManifest = AppManifest,
  // deno-lint-ignore ban-types
  TState = {},
> = (
  c: TProps,
) => App<TAppManifest, TState> | AppRuntime;

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
  { resolvers: currentResolvers, manifest: currentManifest }: AppRuntime,
  { resolvers, manifest }: AppRuntime,
): AppRuntime => {
  return {
    manifest: mergeManifests(currentManifest, manifest),
    resolvers: {
      ...currentResolvers,
      ...resolvers,
    },
  };
};

export const buildApp = <
  TApp extends App,
  TContext extends BaseContext = BaseContext,
  TResolverMap extends ResolverMap<TContext> = ResolverMap<TContext>,
  TResolvableMap extends ResolvableMap<TContext, TResolverMap> = Record<
    string,
    any
  >,
>(
  { state, manifest }: TApp,
): AppRuntime<TContext, TResolverMap, TResolvableMap> => {
  const injectedManifest = injectAppStateOnManifest(state, manifest);
  return {
    resolvers: resolversFrom<TApp["manifest"], TContext, TResolverMap>(
      injectedManifest,
    ),
    manifest: injectedManifest,
  };
};

const isAppRuntime = <TApp extends App, TAppRuntime extends AppRuntime>(
  app: TApp | TAppRuntime,
): app is TAppRuntime => {
  return (app as TAppRuntime)?.resolvers !== undefined;
};

export interface AppModule
  extends BlockModule<AppFunc, App | AppRuntime, AppRuntime> {
  name?: string;
  docCacheFileUrl?: string;
}

const injectAppState = <TState = any>(
  state: TState,
  fnProps: FnProps,
): FnProps => {
  return (
    props: any,
    request: Request,
    { response, get, invoke }: AppContext,
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
    { response, get, invoke }: AppContext,
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
  >({ default: fn, name, docCacheFileUrl }: AppModule) =>
  (props: TProps) => {
    if (!name) {
      throw new Error(
        "apps without a name is not support yet",
      );
    }
    const baseKey = import.meta.resolve(`${name}/`);
    const fileUrl = docCacheFileUrl ?? `${baseKey}${DOC_CACHE_FILE_NAME}`;
    hydrateOnce[name] ??= once<void>();
    hydrateOnce[name].do(() => {
      return hydrateDocCacheWith(
        fileUrl.startsWith("file:") ? fromFileUrl(fileUrl) : fileUrl,
        baseKey,
      );
    });
    const app = fn(props);
    if (isAppRuntime(app)) {
      return app;
    }

    return buildApp(app);
  },
};

/**
 * <TState>(state:TState) => Manifest
 * The app block is used to configure platforms using settings
 */
export default appBlock;
