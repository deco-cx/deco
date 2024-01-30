// deno-lint-ignore-file no-explicit-any
import { Context, DecoContext } from "../../../deco.ts";
import { MiddlewareHandler, MiddlewareHandlerContext } from "../../../deps.ts";
import { DECO_FILE_NAME, newFsProvider } from "../../../engine/releases/fs.ts";
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
    context: MiddlewareHandlerContext<
      DecoState<any, DecoSiteState, TManifest>
    >,
  ) {
    const opt = typeof _opt === "function" ? await _opt(request) : _opt;
    const releaseProvider =
      opt?.useLocalStorageOnly || Deno.env.has("USE_LOCAL_STORAGE_ONLY")
        ? newFsProvider(DECO_FILE_NAME, opt.manifest.name)
        : opt.release;
    // Define root manifest
    const rootManifest = {
      baseUrl: opt.manifest.baseUrl,
      name: opt.manifest.name,
      apps: { ...opt.manifest.apps },
    };

    contextCache ??= new ContextCache({
      cacheSize: 7, // 7 is arbitrarily chosen
    });

    let contextPromise: Promise<DecoContext> | undefined = contextCache.get(
      opt,
    );

    if (!contextPromise) {
      contextPromise = newContext(
        rootManifest,
        opt.sourceMap,
        releaseProvider,
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
