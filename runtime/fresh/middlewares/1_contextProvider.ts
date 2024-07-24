import type { DecoMiddleware } from "deco/runtime/routing/middleware.ts";
import { Context, type DecoContext } from "../../../deco.ts";
import { DECO_FILE_NAME, newFsProvider } from "../../../engine/decofile/fs.ts";
import {
  type DecofileProvider,
  getProvider,
} from "../../../engine/decofile/provider.ts";
import { siteNameFromEnv } from "../../../engine/manifest/manifest.ts";
import { randomSiteName } from "../../../engine/manifest/utils.ts";
import { newContext } from "../../../mod.ts";
import type { InitOptions, OptionsProvider } from "../../../plugins/deco.ts";
import type { AppManifest } from "../../../types.ts";
import { ContextCache } from "./2_alienRelease.ts";

let contextCache: ContextCache | null = null;

export const contextProvider = <TManifest extends AppManifest = AppManifest>(
  _opt: InitOptions<TManifest> | OptionsProvider,
): DecoMiddleware<TManifest> => {
  // Return an async function to handle requests
  return async function (
    context,
  ) {
    if (context.req.url.endsWith("/_healthcheck")) {
      return new Response(
        "OK",
        { status: 200 },
      );
    }
    const opt = typeof _opt === "function" ? await _opt(context.req) : _opt;
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
      let namespace: string | undefined = opt.manifest.name;
      let releaseProviderPromise: Promise<DecofileProvider>;
      if (shouldUseLocalStorage) {
        releaseProviderPromise = Promise.resolve(
          newFsProvider(DECO_FILE_NAME, siteName),
        );
      } else if (opt.release) {
        releaseProviderPromise = Promise.resolve(opt.release);
        siteName = opt.site?.name ?? siteNameFromEnv() ?? siteName;
        namespace = opt?.site?.namespace;
      } else {
        const fromEnvSiteName = siteNameFromEnv();
        if (!fromEnvSiteName && Context.active().isDeploy) {
          console.warn(
            "DECO_SITE_NAME env var not defined. A random site name will be used, be aware that logs and metrics will not be collected properly.",
          );
        }
        siteName = fromEnvSiteName ?? randomSiteName();
        releaseProviderPromise = getProvider(
          siteName,
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
          namespace,
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
