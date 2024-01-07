// deno-lint-ignore-file no-explicit-any
import {
  adjectives,
  animals,
  NumberDictionary,
  uniqueNamesGenerator,
} from "https://esm.sh/v135/unique-names-generator@4.7.1";
import { deferred } from "std/async/deferred.ts";
import { parse } from "std/flags/mod.ts";
import { blue, gray, green, rgb24, underline } from "std/fmt/colors.ts";
import {
  AppManifest,
  AppRuntime,
  MergedAppRuntime,
  mergeManifests,
  mergeRuntimes,
  SourceMap,
} from "../../blocks/app.ts";
import { buildRuntime } from "../../blocks/appsUtil.ts";
import blocks from "../../blocks/index.ts";
import { buildSourceMap } from "../../blocks/utils.tsx";
import { Context, context, DecoContext, DecoRuntimeState } from "../../deco.ts";
import { HandlerContext } from "../../deps.ts";
import { DecoState, SiteInfo } from "../../types.ts";
import { ReleaseResolver } from "../core/mod.ts";
import {
  BaseContext,
  DanglingReference,
  isResolvable,
  Resolvable,
  Resolver,
  ResolverMap,
} from "../core/resolver.ts";
import { PromiseOrValue } from "../core/utils.ts";
import { integrityCheck } from "../integrity.ts";
import defaultResolvers from "../manifest/fresh.ts";
import { DECO_FILE_NAME, newFsProvider } from "../releases/fs.ts";
import { getComposedConfigStore, Release } from "../releases/provider.ts";
import defaults from "./defaults.ts";

const numberDictionary = NumberDictionary.generate({ min: 10, max: 99 });
const shouldCheckIntegrity = parse(Deno.args)["check"] === true;

const ENV_SITE_NAME = "DECO_SITE_NAME";
const DECO_COLORS = 0x02f77d;
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
  const context = Context.active();
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

const getPlayDomain = (): string => {
  if (!Deno.env.has("CODESPACE_NAME")) {
    return "http://localhost:8000";
  }
  return `https://${Deno.env.get("CODESPACE_NAME")}-8000.${
    Deno.env.get("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN")
  }`;
};
export const initContext = async <
  T extends AppManifest,
>(
  m: T,
  currSourceMap?: SourceMap,
  release: Release | undefined = undefined,
): Promise<DecoContext> => {
  Object.assign(context, await newContext(m, currSourceMap, release));
  if (context.play) {
    console.debug(
      `\n👋 Hey [${green(context.site)}] welcome to ${
        rgb24("deco.cx", DECO_COLORS)
      }! Let's play?`,
    );
    console.debug(
      `📚 Explore our documentation at ${
        underline(blue("https://deco.cx/docs"))
      } to get started with deco.`,
    );
    console.debug(
      `💬 Join our Discord community at ${
        underline(blue("https://deco.cx/discord"))
      } to connect with other deco enthusiasts.`,
    );
    console.debug(`🚀 Enter: ${
      underline(rgb24(
        `https://play.deco.cx/?domain=${getPlayDomain()}`,
        DECO_COLORS,
      ))
    } and happy coding!\n\n`);
  }
  return context;
};

export const newContext = <
  T extends AppManifest,
>(
  m: T,
  currSourceMap?: SourceMap,
  release: Release | undefined = undefined,
  instanceId: string | undefined = undefined,
): Promise<DecoContext> => {
  const currentContext = Context.active();
  const ctx: DecoContext = {
    ...currentContext,
    instance: {
      id: instanceId ?? crypto.randomUUID(),
      startedAt: new Date(),
    },
  };
  let currentSite = siteName();
  if (!currentSite || Deno.env.has("USE_LOCAL_STORAGE_ONLY")) {
    if (ctx.isDeploy) {
      throw new Error(
        `site is not identified, use variable ${ENV_SITE_NAME} to define it`,
      );
    }
    currentSite = uniqueNamesGenerator({
      dictionaries: [animals, adjectives, numberDictionary],
      length: 3,
      separator: "-",
    });
    release ??= newFsProvider(DECO_FILE_NAME, m.name);
    ctx.play = true;
  }
  ctx.namespace ??= `deco-sites/${currentSite}`;
  ctx.site = currentSite!;
  const [newManifest, resolvers, recovers] = (blocks() ?? []).reduce(
    (curr, acc) => buildRuntime<AppManifest, FreshContext>(curr, acc),
    [m, {}, []] as [AppManifest, ResolverMap<FreshContext>, DanglingRecover[]],
  );
  const provider = release ?? getComposedConfigStore(
    ctx.namespace!,
    ctx.site,
    ctx.siteId,
  );
  const runtimePromise = deferred<DecoRuntimeState>();
  ctx.runtime = runtimePromise.finally(() => {
    ctx.instance.readyAt = new Date();
  });

  ctx.release = provider;
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
    const allAppsMap: Record<string, Resolvable> = {};
    let currentResolver = resolver;
    while (true) {
      const currentApps: Record<string, Resolvable> = {};
      const { resolvers: currResolvers, resolvables: currResolvables } =
        await currentResolver.resolve<
          { resolvers: ResolverMap; resolvables: Record<string, Resolvable> }
        >({
          __resolveType: defaults["state"].name,
        }, fakeCtx);

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
          !(key in allAppsMap)
        ) {
          allAppsMap[key] = value;
          currentApps[key] = value;
        }
      }
      if (Object.keys(currentApps).length === 0) {
        break;
      }

      const apps = Object.values(currentApps);
      // first pass nullIfDangling
      const { apps: installedApps } = await currentResolver.resolve<
        { apps: MergedAppRuntime[] }
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
    const apps = Object.values(allAppsMap);
    if (!apps || apps.length === 0) {
      runtimePromise.resolve({
        resolver: currentResolver,
        manifest: newManifest,
        sourceMap: currSourceMap ?? buildSourceMap(newManifest),
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
    // second => nullIfDangling
    const { apps: installedApps } = await currentResolver.resolve<
      { apps: AppRuntime[] }
    >({ apps }, fakeCtx).catch((err) => {
      console.error(
        "installing apps failed",
        err,
        "this will falling back to null references to make it work, you should fix this",
      );
      return currentResolver.resolve<
        { apps: MergedAppRuntime[] }
      >({ apps }, fakeCtx, {
        nullIfDangling: true,
        propagateOptions: true,
      });
    });
    const { manifest, sourceMap, resolvers, resolvables = {} } = installedApps
      .reduce(
        mergeRuntimes,
      );

    currentResolver = currentResolver.with({ resolvers, resolvables });

    // for who is awaiting for the previous promise
    const mSourceMap = { ...sourceMap, ...currSourceMap ?? {} };
    const runtime = {
      manifest: mergeManifests(newManifest, manifest),
      sourceMap: mSourceMap,
      resolver: currentResolver,
    };
    if (runtimePromise.state !== "fulfilled") {
      runtimePromise.resolve(runtime);
    }

    ctx.runtime = Promise.resolve(runtime);
  };

  let appsInstallationMutex = deferred();
  provider.onChange(() => {
    // limiter to not allow multiple installations in parallel
    Promise.all([appsInstallationMutex, firstInstallAppsPromise]).then(() => {
      appsInstallationMutex = deferred();
      // installApps should never block next install as the first install is the only that really matters.
      // so we should resolve to let next install happen immediately
      installApps().finally(appsInstallationMutex.resolve);
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
      `[${green(ctx.site)}]: the apps has been installed in ${
        (performance.now() - start).toFixed(0)
      }ms`,
    );
    return runtimePromise.then((runtime) => runtime.resolver);
  }).then(() => ctx);
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
  context.instance.readyAt = new Date();
  console.log(
    `starting deco: ${
      context.siteId === -1 ? "" : `siteId=${context.siteId}`
    } site=${context.site}`,
  );

  return newManifest as T;
};
