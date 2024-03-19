// deno-lint-ignore-file no-explicit-any
import { Context, DecoContext } from "../../../deco.ts";
import { FreshContext, MiddlewareHandler } from "../../../deps.ts";
import { siteNameFromEnv } from "../../../engine/manifest/manifest.ts";
import { randomSiteName } from "../../../engine/manifest/utils.ts";
import { DECO_FILE_NAME, newFsProvider } from "../../../engine/releases/fs.ts";
import { getRelease, Release } from "../../../engine/releases/provider.ts";
import { newContext } from "../../../mod.ts";
import { InitOptions, OptionsProvider } from "../../../plugins/deco.ts";
import { AppManifest, DecoSiteState, DecoState } from "../../../types.ts";
import { ContextCache } from "./1_alienRelease.ts";

let contextCache: ContextCache | null = null;

export const contextProvider = <TManifest extends AppManifest = AppManifest>(
  _opt: InitOptions<TManifest> | OptionsProvider,
): MiddlewareHandler<DecoState<any, DecoSiteState, TManifest>> => {
  // Return an async function to handle requests
  return async function (
    request: Request,
    context: FreshContext<
      DecoState<any, DecoSiteState, TManifest>
    >,
  ) {
    const opt = typeof _opt === "function" ? await _opt(request) : _opt;
    contextCache ??= new ContextCache({
      cacheSize: 7, // 7 is arbitrarily chosen
    });
    let contextPromise: Promise<DecoContext> | undefined = contextCache.get(
      opt,
    );
    if (!contextPromise) {
      const shouldUseLocalStorage = opt?.useLocalStorageOnly ||
        Deno.env.has("USE_LOCAL_STORAGE_ONLY");
      let siteName = opt.manifest.name;
      let releaseProviderPromise: Promise<Release>;
      if (shouldUseLocalStorage) {
        releaseProviderPromise = Promise.resolve(
          newFsProvider(DECO_FILE_NAME, siteName),
        );
      } else if (opt.release) {
        releaseProviderPromise = Promise.resolve(opt.release);
        siteName = opt.site?.name ?? siteNameFromEnv() ?? siteName;
      } else {
        const fromEnvSiteName = siteNameFromEnv();
        if (!fromEnvSiteName && Context.active().isDeploy) {
          throw new Error("DECO_SITE_NAME env var not defined.");
        }
        siteName = fromEnvSiteName ?? randomSiteName();
        releaseProviderPromise = getRelease(
          opt.manifest.name,
          siteName,
          -1,
        );
      }
      // Define root manifest

      contextPromise = releaseProviderPromise.then((releaseProvider) =>
        newContext(
          opt.manifest,
          opt.importMap,
          releaseProvider,
          undefined,
          siteName,
        )
      );
      contextCache.set(
        opt,
        contextPromise,
      );
    }

    const next = Context.bind(
      await contextPromise,
      context.next.bind(context),
    );

    return next();
  };
};

