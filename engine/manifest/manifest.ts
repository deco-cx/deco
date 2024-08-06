// deno-lint-ignore-file no-explicit-any
import { parse } from "@std/flags";
import { gray, green, red } from "@std/fmt/colors";
import {
  type AppManifest,
  type ImportMap,
  type MergedAppRuntime,
  mergeManifests,
  mergeRuntimes,
} from "../../blocks/app.ts";
import { buildRuntime } from "../../blocks/appsUtil.ts";
import blocks from "../../blocks/index.ts";
import { buildImportMap } from "../../blocks/utils.tsx";
import {
  Context,
  context,
  type DecoContext,
  type DecoRuntimeState,
} from "../../deco.ts";
import { baseState } from "../../runtime/utils.ts";
import type { DecoState, SiteInfo } from "../../types.ts";
import { deferred } from "../../utils/promise.ts";
import { randId } from "../../utils/rand.ts";
import { ReleaseResolver } from "../core/mod.ts";
import {
  type BaseContext,
  DanglingReference,
  isResolvable,
  type Resolvable,
  type Resolver,
  type ResolverMap,
} from "../core/resolver.ts";
import { ENV_SITE_NAME } from "../decofile/constants.ts";
import { DECO_FILE_NAME, newFsProvider } from "../decofile/fs.ts";
import { type DecofileProvider, getProvider } from "../decofile/provider.ts";
import { integrityCheck } from "../integrity.ts";
import defaultResolvers from "../manifest/fresh.ts";
import defaults from "./defaults.ts";
import { randomSiteName } from "./utils.ts";

const shouldCheckIntegrity = parse(Deno.args)["check"] === true;

export interface HandlerContext<
  Data = unknown,
  State = Record<string, unknown>,
> {
  params: Record<string, string>;
  state: State;
  render: (
    data?: Data,
  ) => Response | Promise<Response>;
}

export interface RouteContext<Data = any, State = any, TConfig = any>
  extends BaseContext {
  context: HandlerContext<Data, DecoState<State, TConfig>>;
  request: Request;
}

export type LiveState<T, TState = unknown> = TState & {
  $live: T;
};

export interface DanglingRecover {
  recoverable: (type: string) => boolean;
  recover: Resolver;
}

// fakeContext is used to allow call resolve outside a request lifecycle
const newFakeContext = () => {
  return {
    request: new Request("http://localhost:8000"),
    context: {
      url: new URL("http://localhost:8000"),
      basePath: "/",
      route: "/[...catchall]",
      pattern: "/[...catchall]",
      isPartial: false,
      state: baseState(),
      params: {},
      destination: "route",
      data: {},
      next: () => Promise.resolve(new Response(null)),
      render: () => new Response(null),
      renderNotFound: () => new Response(null),
      remoteAddr: { hostname: "", port: 0, transport: "tcp" as const },
    } as RouteContext["context"],
  };
};
export const buildDanglingRecover = (recovers: DanglingRecover[]): Resolver => {
  return (parent, ctx) => {
    const curr = ctx.resolveChain.findLast((r) => r.type === "dangling")?.value;

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

export const siteNameFromEnv = () => Deno.env.get(ENV_SITE_NAME);
export const siteName = (): string | undefined => {
  const context = Context.active();
  const fromEnvSiteName = siteNameFromEnv();
  if (fromEnvSiteName) {
    return fromEnvSiteName;
  }
  if (!context.namespace) {
    return undefined;
  }
  const [_, siteName] = context.namespace!.split("/"); // deco-sites/std best effort
  return siteName ?? context.namespace!;
};

export const initContext = async <
  T extends AppManifest,
>(
  m: T,
  currentImportMap?: ImportMap,
  release: DecofileProvider | undefined = undefined,
): Promise<DecoContext> => {
  await fulfillContext(context, m, currentImportMap, release);
  return context;
};

const installAppsForResolver = async (
  resolver: ReleaseResolver<RouteContext>,
  initialManifest: AppManifest,
  initialImportMap?: ImportMap,
) => {
  let manifest = initialManifest;
  let importMap = initialImportMap;
  const fakeCtx = newFakeContext();
  const unresolved: Record<string, Set<Resolvable>> = {};
  const allAppsMap: Record<string, Resolvable> = {};

  let currentResolver = resolver;
  const getState = () => {
    return currentResolver.resolve<
      { resolvers: ResolverMap; resolvables: Record<string, Resolvable> }
    >({
      __resolveType: defaults["state"].name,
    }, fakeCtx);
  };

  /**
   * Install the given saved apps.
   * Those apps are always available at that time, but their dependencies can still be pending for installing.
   */
  const installInstallableApps = async (
    apps: Resolvable[],
  ): Promise<boolean> => {
    const _installedApps = await Promise.all(apps.map((app) => {
      return currentResolver.resolve<
        MergedAppRuntime
      >(app, fakeCtx, {
        nullIfDangling: true,
        propagateOptions: true,
        hooks: {
          onDanglingReference: (resolveType) => {
            // if the app is not resolved, we should keep it for the next round
            unresolved[resolveType] ??= new Set([]);
            unresolved[resolveType].add(app);
          },
        },
      });
    }));

    // if there's no app installed so we should be ok to stop the loop.
    const installedApps = _installedApps.filter(Boolean);
    if (installedApps.length === 0) {
      return false;
    }
    // if there are apps installed so incorporate the current resolver into the resolvables.
    const {
      resolvers,
      resolvables = {},
      manifest: mManifest,
      importMap: appImportMap,
    } = installedApps
      .filter(Boolean)
      .reduce(
        mergeRuntimes,
      );
    manifest = mergeManifests(mManifest, manifest);
    importMap = {
      ...appImportMap,
      ...importMap,
      imports: { ...appImportMap?.imports, ...importMap?.imports },
    };
    currentResolver = currentResolver.with({ resolvers, resolvables });
    return true;
  };

  do {
    const { resolvers: currResolvers, resolvables: currResolvables } =
      await getState();

    const installableApps: Record<string, Resolvable> = {};
    // find all installed apps.
    for (const [key, value] of Object.entries(currResolvables)) {
      if (!isResolvable(value) || (key in allAppsMap)) {
        continue;
      }
      const resolver = findResolver(
        currResolvers,
        value.__resolveType,
        currResolvables,
      );
      if (
        resolver !== undefined && resolver.type === "apps" &&
        !(key in installableApps)
      ) {
        installableApps[key] = value;
        allAppsMap[key] = value;
      }
    }
    const apps: Resolvable[] = Object.values(installableApps);
    if (!(await installInstallableApps(apps))) {
      break;
    }

    // after an installation new resolvers become available so now we can check if we can resolve them.
    const newAvailableAppsToInstall: Set<Resolvable> = new Set<Resolvable>();
    for (const [key, apps] of Object.entries(unresolved)) {
      for (const app of apps) {
        if (key in currentResolver.getResolvers()) {
          newAvailableAppsToInstall.add(app);
        }
      }

      delete unresolved[key];
    }
    await installInstallableApps([...newAvailableAppsToInstall]);
  } while (true);
  // warn about unresolved references.
  if (Object.keys(unresolved).length > 0) {
    console.error(
      red(
        "caution! the following apps were installed without fully resolved props",
      ),
    );
    const table: Record<string, string[]> = {};
    for (const [key, apps] of Object.entries(unresolved)) {
      for (const app of apps) {
        const type = app.__resolveType;
        table[type] ??= [];
        table[type].push(key);
      }
    }
    console.table(
      Object.entries(table).map(([type, keys]) => {
        return { app: type, resolvers: keys.join(", ") };
      }),
    );
  }
  return { resolver: currentResolver, apps: allAppsMap, manifest, importMap };
};
export const fulfillContext = async <
  T extends AppManifest,
>(
  ctx: DecoContext<T>,
  initialManifest: T,
  currentImportMap?: ImportMap,
  release: DecofileProvider | undefined = undefined,
): Promise<DecoContext<T>> => {
  let currentSite = ctx.site ?? siteName();
  if (!currentSite || Deno.env.has("USE_LOCAL_STORAGE_ONLY")) {
    if (ctx.isDeploy) {
      throw new Error(
        `site is not identified, use variable ${ENV_SITE_NAME} to define it`,
      );
    }
    currentSite = randomSiteName();
    release ??= newFsProvider(DECO_FILE_NAME, initialManifest.name);
  }
  ctx.namespace ??= `deco-sites/${currentSite}`;
  ctx.site = currentSite!;
  const provider = release ?? await getProvider(
    ctx.site,
  );
  const runtimePromise = deferred<DecoRuntimeState<T>>();
  ctx.runtime = runtimePromise.finally(() => {
    ctx.instance.readyAt = new Date();
  });

  ctx.release = provider;
  const resolver = new ReleaseResolver<RouteContext>({
    resolvers: defaultResolvers,
    release: provider,
  });
  const firstInstallAppsPromise = deferred<void>();
  const installApps = async () => {
    const [newManifest, resolvers, recovers] = (blocks() ?? []).reduce(
      (curr, acc) => buildRuntime<AppManifest, RouteContext>(curr, acc),
      [
        {
          baseUrl: initialManifest.baseUrl,
          name: initialManifest.name,
          apps: initialManifest.apps,
        },
        {},
        [],
      ] as [
        AppManifest,
        ResolverMap<RouteContext>,
        DanglingRecover[],
      ],
    );
    const { resolver: currentResolver, apps: allAppsMap, manifest, importMap } =
      await installAppsForResolver(
        resolver.with({
          resolvers,
          danglingRecover: recovers.length > 0
            ? buildDanglingRecover(recovers)
            : undefined,
        }),
        newManifest,
        currentImportMap,
      );
    const apps: Resolvable[] = Object.values(allAppsMap);
    if (!apps || apps.length === 0) {
      runtimePromise.resolve({
        resolver: currentResolver,
        manifest: newManifest as T,
        importMap: currentImportMap ?? buildImportMap(newManifest),
      });
      firstInstallAppsPromise.resolve();
      return;
    }
    const appNames = Object.keys(allAppsMap);
    const longerName = appNames.reduce(
      (currentLength, name) =>
        currentLength > name.length ? currentLength : name.length,
      0,
    );

    console.log(
      `[${green(ctx.site)}]: installing ${green(`${appNames.length}`)} apps: ${
        appNames.map((name) =>
          `\n${green(name.padEnd(longerName))} - ${
            gray(allAppsMap[name].__resolveType)
          }`
        ).join("")
      }`,
    );

    // for who is awaiting for the previous promise
    const mergedImportMap = {
      imports: { ...importMap?.imports, ...currentImportMap?.imports ?? {} },
    };
    const runtime = {
      manifest: mergeManifests(newManifest, manifest) as T,
      importMap: mergedImportMap,
      resolver: currentResolver,
    };
    if (runtimePromise.state === "pending") {
      runtimePromise.resolve(runtime);
    }
    ctx.runtime = Promise.resolve(runtime);
  };

  let appsInstallationMutex = deferred<void>();
  provider.onChange(() => {
    // limiter to not allow multiple installations in parallel
    return Promise.all([appsInstallationMutex, firstInstallAppsPromise]).then(
      () => {
        appsInstallationMutex = deferred();
        // installApps should never block next install as the first install is the only that really matters.
        // so we should resolve to let next install happen immediately
        return installApps().finally(appsInstallationMutex.resolve);
      },
    );
  });
  provider.state().then(() => {
    installApps().then(firstInstallAppsPromise.resolve).catch(
      firstInstallAppsPromise.reject,
    ).then(appsInstallationMutex.resolve);
  }).catch(firstInstallAppsPromise.reject);

  if (shouldCheckIntegrity) {
    provider.state().then(
      (resolvables: Record<string, Resolvable>) => {
        integrityCheck(resolver.getResolvers(), resolvables);
      },
    );
  }
  const start = performance.now();
  return firstInstallAppsPromise.then(() => {
    console.log(
      `[${green(ctx.site)}]: the apps has been installed in ${
        (performance.now() - start).toFixed(0)
      }ms`,
    );
    return runtimePromise.then((runtime) => runtime.resolver);
  }).then(() => ctx);
};

export const newContext = <
  T extends AppManifest,
>(
  m: T,
  currentImportMap?: ImportMap,
  release: DecofileProvider | undefined = undefined,
  instanceId: string | undefined = undefined,
  site: string | undefined = undefined,
  namespace: string = "site",
): Promise<DecoContext<T>> => {
  const currentContext = Context.active<T>();
  const ctx: DecoContext<T> = {
    ...currentContext,
    site: site ?? currentContext.site,
    namespace: namespace ?? currentContext.namespace,
    instance: {
      id: instanceId ?? randId(),
      startedAt: new Date(),
    },
  };

  return fulfillContext(ctx, m, currentImportMap, release);
};

export const $live = async <T extends AppManifest>(
  m: T,
  siteInfo?: SiteInfo,
  release: DecofileProvider | undefined = undefined,
): Promise<T> => {
  context.namespace = siteInfo?.namespace;
  const currentSite = siteName();
  if (!currentSite) {
    throw new Error(
      `site is not identified, use variable ${ENV_SITE_NAME} to define it`,
    );
  }
  context.namespace ??= `deco-sites/${currentSite}`;
  context.site = currentSite;
  const [newManifest, resolvers, recovers] = (blocks() ?? []).reduce(
    (curr, acc) => buildRuntime<AppManifest, RouteContext>(curr, acc),
    [m, {}, []] as [AppManifest, ResolverMap<RouteContext>, DanglingRecover[]],
  );
  const provider = release ?? await getProvider(
    context.site,
  );
  context.release = provider;
  const resolver = new ReleaseResolver<RouteContext>({
    resolvers: { ...resolvers, ...defaultResolvers },
    release: provider,
    danglingRecover: recovers.length > 0
      ? buildDanglingRecover(recovers)
      : undefined,
  });

  // should be set first
  context.runtime = Promise.resolve({
    manifest: newManifest,
    resolver,
    importMap: buildImportMap(newManifest),
  });
  context.instance.readyAt = new Date();
  console.log(
    `starting deco: site=${context.site}`,
  );

  return newManifest as T;
};

function findResolver(
  currResolvers: ResolverMap,
  currentResolveType: string,
  currResolvables: Record<string, any>,
) {
  let resolver: Resolver | undefined = undefined;
  const seen = new Set<string>();
  while (true) {
    if (seen.has(currentResolveType)) {
      console.warn(
        `a loop was detected when trying to resolve ${currentResolveType}`,
      );
      break;
    }
    seen.add(currentResolveType);
    resolver = currResolvers[currentResolveType];
    if (resolver !== undefined) {
      break;
    }
    const resolvable = currResolvables[currentResolveType];
    if (!resolvable || !isResolvable(resolvable)) {
      break;
    }
    currentResolveType = resolvable.__resolveType;
  }
  return resolver;
}
