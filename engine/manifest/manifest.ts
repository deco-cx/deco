// deno-lint-ignore-file no-explicit-any
import blocks from "../../blocks/index.ts";
import { HandlerContext } from "../../deps.ts";
import { ReleaseResolver } from "../../engine/core/mod.ts";
import {
  BaseContext,
  DanglingReference,
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
import { context } from "../../live.ts";
import { DecoState } from "../../types.ts";

import { deferred } from "std/async/deferred.ts";
import { parse } from "std/flags/mod.ts";
import {
  AppManifest,
  AppRuntime,
  mergeRuntimes,
  SourceMap,
} from "../../blocks/app.ts";
import { buildRuntime } from "../../blocks/appsUtil.ts";
import { buildSourceMap } from "../../blocks/utils.tsx";
import { SiteInfo } from "../../types.ts";
import { ReleaseExtensions } from "../core/mod.ts";
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
) => {
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
  const manifestPromise = deferred<AppManifest>();
  context.manifest = manifestPromise;

  const sourceMapPromise = deferred<SourceMap>();
  context.sourceMap = sourceMapPromise;

  context.release = provider;
  let currExtensions: Promise<ReleaseExtensions<FreshContext>> = Promise
    .resolve(
      { resolvers, resolvables: {} },
    );
  const resolver = new ReleaseResolver<FreshContext>({
    loadExtensions: () =>
      currExtensions.then((current) => ({
        ...current,
        resolvers: { ...current.resolvers, ...defaultResolvers },
      })),
    release: provider,
    danglingRecover: recovers.length > 0
      ? buildDanglingRecover(recovers)
      : undefined,
  });
  provider.onChange(() => {
    resolver.resolve<{ apps: AppRuntime[] }>({
      __resolveType: defaults["bootstrap"].name,
    }, {
      request: new Request("http://localhost:8000"),
      context: {
        state: {},
        params: {},
        render: () => new Response(null),
        renderNotFound: () => new Response(null),
        remoteAddr: { hostname: "", port: 0, transport: "tcp" },
      },
    }).then(({ apps }) => {
      if (!apps || apps.length === 0) {
        manifestPromise.resolve(newManifest);
        sourceMapPromise.resolve({
          ...buildSourceMap(newManifest),
          ...currSourceMap ?? {},
        });
        return;
      }
      const { manifest, sourceMap, resolvers, resolvables = {} } = apps
        .reduce(
          mergeRuntimes,
        );
      // for who is awaiting for the previous promise
      const mSourceMap = { ...sourceMap, ...currSourceMap ?? {} };
      if (manifestPromise.state !== "fulfilled") {
        manifestPromise.resolve(manifest);
      }
      if (sourceMapPromise.state !== "fulfilled") {
        sourceMapPromise.resolve(mSourceMap);
      }
      currExtensions = Promise.resolve({
        resolvers,
        resolvables,
      });
      context.manifest = Promise.resolve(manifest);
      context.sourceMap = Promise.resolve(mSourceMap);
    });
  });

  if (shouldCheckIntegrity) {
    provider.state().then(
      (resolvables: Record<string, Resolvable>) => {
        resolver.getResolvers().then((resolvers) => {
          integrityCheck(resolvers, resolvables);
        });
      },
    );
  }
  // should be set first
  context.releaseResolver = resolver;
  console.log(
    `Starting deco: site=${context.site}`,
  );
  return resolver;
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
    loadExtensions: () =>
      Promise.resolve({
        resolvers: { ...resolvers, ...defaultResolvers },
        resolvables: {},
      }),
    release: provider,
    danglingRecover: recovers.length > 0
      ? buildDanglingRecover(recovers)
      : undefined,
  });

  // should be set first
  context.releaseResolver = resolver;
  context.manifest = Promise.resolve(newManifest);
  console.log(
    `Starting deco: ${
      context.siteId === -1 ? "" : `siteId=${context.siteId}`
    } site=${context.site}`,
  );

  return newManifest as T;
};
