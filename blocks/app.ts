// deno-lint-ignore-file no-explicit-any ban-types
import blocks from "../blocks/index.ts";
import { propsLoader } from "../blocks/propsLoader.ts";
import { SectionModule } from "../blocks/section.ts";
import { AppHttpContext, buildSourceMap, FnProps } from "../blocks/utils.tsx";
import {
  Block,
  BlockModule,
  BlockModuleRef,
  InstanceOf,
} from "../engine/block.ts";
import {
  BaseContext,
  ResolvableMap,
  ResolverMap,
} from "../engine/core/resolver.ts";
import { mapObjKeys } from "../engine/core/utils.ts";
import {
  ResolverMiddleware,
  ResolverMiddlewareContext,
} from "../engine/middleware.ts";
import { DecoManifest, FnContext } from "../types.ts";
import { resolversFrom } from "./appsUtil.ts";
import { fnContextFromHttpContext } from "./utils.tsx";

export type SourceMapResolver = () => Promise<BlockModuleRef | undefined>;

export type Apps = InstanceOf<AppRuntime, "#/root/apps">;
export type SourceMap = Record<string, string | null | SourceMapResolver>;
export type AppManifest = Omit<DecoManifest, "islands" | "routes">;
type MergeAppsManifest<TCurrent extends AppManifest, TDeps> =
  & TCurrent
  & (TDeps extends [infer TNext, ...infer Rest]
    ? TNext extends App ? MergeAppsManifest<ManifestOf<TNext>, Rest>
    : {}
    : {});

export type ManifestOf<TApp extends App> = MergeAppsManifest<
  TApp["manifest"],
  TApp["dependencies"] extends (infer Deps) | undefined ? Deps : []
>;

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
  sourceMap?: SourceMap;
}

export type AppMiddlewareContext<
  TApp extends App = App,
  TResponse = any,
> = AppContext<TApp> & {
  next?: () => Promise<TResponse>;
};

export type AppMiddleware<
  TApp extends App = any,
  TProps = any,
  TResponse = any,
> = (
  props: TProps,
  req: Request,
  ctx: AppMiddlewareContext<TApp, TResponse>,
) => Promise<TResponse>;

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
  middleware?: AppMiddleware | AppMiddleware[];
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
  sourceMap: SourceMap;
}

type BlockKey = keyof Omit<AppManifest, "baseUrl" | "name">;

export const mergeManifests = (
  current: AppManifest,
  manifest: AppManifest,
): AppManifest => {
  const manifestResult = { ...manifest, ...current };
  const { baseUrl: _ignoreBaseUrl, name: _ignoreName, ...appManifest } =
    manifest;
  for (const [key, value] of Object.entries(appManifest)) {
    const manifestBlocks = { ...(manifestResult[key as BlockKey] ?? {}) };
    for (const [blockKey, blockFunc] of Object.entries(value)) {
      manifestBlocks[blockKey] = blockFunc;
    }
    manifestResult[key as BlockKey] = manifestBlocks as any;
  }

  return manifestResult;
};

export const mergeRuntimes = <
  TAppRuntime extends AppRuntime = AppRuntime,
>(
  {
    resolvers: currentResolvers,
    manifest: currentManifest,
    resolvables: currentResolvables,
    sourceMap: currentSourceMap,
  }: TAppRuntime,
  { resolvers, manifest, resolvables, sourceMap }: TAppRuntime,
): Pick<
  TAppRuntime,
  "manifest" | "resolvables" | "resolvers" | "sourceMap"
> => {
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
    sourceMap: { ...currentSourceMap ?? {}, ...sourceMap ?? {} },
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

const isAppHttpContext = (
  ctx: AppHttpContext | BaseContext,
): ctx is AppHttpContext => {
  return (ctx as AppHttpContext)?.request !== undefined &&
    (ctx as AppHttpContext)?.context?.state?.response !== undefined;
};

const appMiddlewareToResolverMiddleware = <
  TState,
  TContext extends ResolverMiddlewareContext,
>(
  state: TState,
  appMiddleware?: AppMiddleware | AppMiddleware[],
): ResolverMiddleware<any, any, TContext>[] | undefined => {
  if (!appMiddleware) {
    return undefined;
  }
  const middlewares = Array.isArray(appMiddleware)
    ? appMiddleware
    : [appMiddleware];
  return middlewares.map((mid) => {
    return (props, ctx) => {
      if (isAppHttpContext(ctx)) {
        const appHttpCtx = ctx;
        const appCtx = {
          ...fnContextFromHttpContext(appHttpCtx),
          ...state,
          next: ctx.next?.bind?.(ctx),
        };
        return mid(props, appHttpCtx.request, appCtx);
      } else {
        return ctx.next!();
      }
    };
  });
};
const buildRuntimeFromApp = <
  TState,
  TApp extends App<AppManifest, TState> = App<AppManifest, TState>,
  TContext extends BaseContext = BaseContext,
  TResolverMap extends ResolverMap = ResolverMap,
>(
  {
    state,
    manifest,
    resolvables,
    dependencies,
    sourceMap,
    middleware: appMiddleware,
  }: TApp,
): AppRuntime => {
  const injectedManifest = injectAppStateOnManifest(state, manifest);
  return {
    resolvers: resolversFrom<AppManifest, TContext, TResolverMap>(
      injectedManifest,
      blocks(),
      appMiddlewareToResolverMiddleware(state, appMiddleware),
    ),
    manifest: injectedManifest,
    resolvables,
    dependencies,
    sourceMap: sourceMap ?? buildSourceMap(manifest),
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
    { response, get, invoke, bag, ...rest }: FnContext,
  ) => {
    return fnProps(props, request, {
      ...rest,
      ...state,
      bag,
      response,
      get,
      invoke,
    });
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
    { response, bag, get, invoke, ...rest }: FnContext,
  ) => {
    return propsLoader(loader, props, request, {
      ...rest,
      ...state,
      bag,
      response,
      get,
      invoke,
    });
  };
};

const buildApp = <TState = {}>(
  appRuntime: AppRuntime | App<any, TState>,
): AppRuntime => {
  const runtime = isAppRuntime(appRuntime)
    ? appRuntime
    : buildRuntimeFromApp<TState>(appRuntime);
  const dependencies: AppRuntime[] = (runtime.dependencies ?? []).map(
    buildApp,
  );
  return dependencies.reduce(
    mergeRuntimes,
    runtime,
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
  (props: TProps) => {
    try {
      const appRuntime = runtimeFn(props);
      return buildApp(appRuntime);
    } catch (err) {
      console.log(
        "error when building app runtime, falling back to an empty runtime",
        props,
        err,
      );
      return {
        resolvers: {},
        resolvables: {},
        sourceMap: {},
        manifest: {
          baseUrl: import.meta.url,
          name: "",
        },
      };
    }
  },
};

/**
 * <TState>(state:TState) => Manifest
 * The app block is used to configure platforms using settings
 */
export default appBlock;
