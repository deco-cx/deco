// deno-lint-ignore-file no-explicit-any
import blocks from "../../blocks/index.ts";
import { HandlerContext } from "../../deps.ts";
import { ReleaseResolver } from "../../engine/core/mod.ts";
import {
  BaseContext,
  DanglingReference,
  isResolvable,
  Resolvable,
  Resolver,
  ResolverMap,
} from "../../engine/core/resolver.ts";
import { PromiseOrValue } from "../../engine/core/utils.ts";
import { integrityCheck } from "../../engine/integrity.ts";
import defaultResolvers from "../../engine/manifest/defaults.ts";
import {
  getComposedConfigStore,
  Release,
} from "../../engine/releases/provider.ts";
import { context, DecoRuntimeState } from "../../live.ts";
import { DecoState } from "../../types.ts";

import { deferred } from "std/async/deferred.ts";
import { parse } from "std/flags/mod.ts";
import { green } from "std/fmt/colors.ts";
import {
  AppManifest,
  AppRuntime,
  mergeRuntimes,
  SourceMap,
} from "../../blocks/app.ts";
import { buildRuntime } from "../../blocks/appsUtil.ts";
import { buildSourceMap } from "../../blocks/utils.tsx";
import { SiteInfo } from "../../types.ts";
import defaults from "./defaults.ts";

const shouldCheckIntegrity = parse(Deno.args)["check"] === true;

const ENV_SITE_NAME = "DECO_SITE_NAME";

export type FreshHandler<
  TConfig = any,
  TData = any,
  TState = any,
  Resp = Response,
> = (
  request: Request,
  ctx: HandlerContext<TData, DecoState<TState, TConfig>>,
) => PromiseOrValue<Resp>;

export interface FreshContext<Data = any, State = any, TConfig = any>
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
      state: {},
      params: {},
      render: () => new Response(null),
      renderNotFound: () => new Response(null),
      remoteAddr: { hostname: "", port: 0, transport: "tcp" as const },
    },
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

const siteName = (): string | undefined => {
  const siteNameFromEnv = Deno.env.get(ENV_SITE_NAME);
  if (siteNameFromEnv) {
    return siteNameFromEnv;
  }
  if (!context.namespace) {
    return undefined;
  }
  const [_, siteName] = context.namespace!.split("/"); // deco-sites/std best effort
  return siteName ?? context.namespace!;
};

export const createResolver = <T extends AppManifest>(
  m: T,
  namespace?: string,
  currSourceMap?: SourceMap,
  release: Release | undefined = undefined,
): Promise<void> => {
  context.namespace ??= namespace;
  const currentSite = siteName();
  if (!currentSite) {
    throw new Error(
      `site is not identified, use variable ${ENV_SITE_NAME} to define it`,
    );
  }
  context.namespace ??= `deco-sites/${currentSite}`;
  context.site = currentSite;
  const [newManifest, resolvers, recovers] = (blocks() ?? []).reduce(
    (curr, acc) => buildRuntime<AppManifest, FreshContext>(curr, acc),
    [m, {}, []] as [AppManifest, ResolverMap<FreshContext>, DanglingRecover[]],
  );
  const provider = release ?? getComposedConfigStore(
    context.namespace!,
    context.site,
    context.siteId,
  );
  const runtimePromise = deferred<DecoRuntimeState>();
  context.runtime = runtimePromise;

  context.release = provider;
  const resolver = new ReleaseResolver<FreshContext>({
    resolvers: { ...resolvers, ...defaultResolvers },
    release: provider,
    danglingRecover: recovers.length > 0
      ? buildDanglingRecover(recovers)
      : undefined,
  });
  const firstInstallAppsPromise = deferred<void>();
  const installApps = async () => {
    const fakeCtx = newFakeContext();
    const appsMap: Record<string, Resolvable> = {};
    let currentResolver = resolver;
    while (true) {
      const { resolvers: currResolvers, resolvables: currResolvables } =
        await currentResolver.resolve<
          { resolvers: ResolverMap; resolvables: Record<string, Resolvable> }
        >({
          __resolveType: defaults["state"].name,
        }, fakeCtx);

      let atLeastOneNewApp = false;
      for (const [key, value] of Object.entries(currResolvables)) {
        if (!isResolvable(value)) {
          continue;
        }
        let resolver: Resolver | undefined = undefined;
        let currentResolveType = value.__resolveType;
        while (true) {
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
        if (
          resolver !== undefined && resolver.type === "apps" &&
          !(key in appsMap)
        ) {
          appsMap[key] = value;
          atLeastOneNewApp = true;
        }
      }
      if (!atLeastOneNewApp) {
        break;
      }

      const apps = Object.values(appsMap);
      // first pass nullIfDangling
      const { apps: installedApps } = await currentResolver.resolve<
        { apps: AppRuntime[] }
      >({ apps }, fakeCtx, {
        nullIfDangling: true,
        propagateOptions: true,
      });
      const { resolvers, resolvables = {} } = installedApps.filter(Boolean)
        .reduce(
          mergeRuntimes,
        );
      currentResolver = currentResolver.with({ resolvers, resolvables });
    }
    const apps = Object.values(appsMap);
    if (!apps || apps.length === 0) {
      runtimePromise.resolve({
        resolver: currentResolver,
        manifest: newManifest,
        sourceMap: currSourceMap ?? buildSourceMap(newManifest),
      });
      firstInstallAppsPromise.resolve();
      return;
    }
    // firstPass => nullIfDangling
    const { apps: installedApps } = await currentResolver.resolve<
      { apps: AppRuntime[] }
    >({ apps }, fakeCtx);
    const { manifest, sourceMap, resolvers, resolvables = {} } = installedApps
      .reduce(
        mergeRuntimes,
      );

    currentResolver = currentResolver.with({ resolvers, resolvables });

    // for who is awaiting for the previous promise
    const mSourceMap = { ...sourceMap, ...currSourceMap ?? {} };
    const runtime = {
      manifest,
      sourceMap: mSourceMap,
      resolver: currentResolver,
    };
    if (runtimePromise.state !== "fulfilled") {
      runtimePromise.resolve(runtime);
    }

    context.runtime = Promise.resolve(runtime);
  };

  let appsInstallationMutex = deferred();
  provider.onChange(() => {
    // limiter to not allow multiple installations in parallel
    Promise.all([appsInstallationMutex, firstInstallAppsPromise]).then(() => {
      appsInstallationMutex = deferred();
      installApps().then(appsInstallationMutex.resolve).catch(
        appsInstallationMutex.reject,
      );
    });
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
      `[${green(context.site)}]: apps has been installed in ${
        (performance.now() - start).toFixed(0)
      }ms`,
    );
  });
};

export const $live = <T extends AppManifest>(
  m: T,
  siteInfo?: SiteInfo,
  release: Release | undefined = undefined,
): T => {
  context.siteId = siteInfo?.siteId ?? -1;
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
    (curr, acc) => buildRuntime<AppManifest, FreshContext>(curr, acc),
    [m, {}, []] as [AppManifest, ResolverMap<FreshContext>, DanglingRecover[]],
  );
  const provider = release ?? getComposedConfigStore(
    context.namespace!,
    context.site,
    context.siteId,
  );
  context.release = provider;
  const resolver = new ReleaseResolver<FreshContext>({
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
    sourceMap: buildSourceMap(newManifest),
  });
  console.log(
    `starting deco: ${
      context.siteId === -1 ? "" : `siteId=${context.siteId}`
    } site=${context.site}`,
  );

  return newManifest as T;
};
