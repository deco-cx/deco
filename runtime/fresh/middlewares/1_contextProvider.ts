// deno-lint-ignore-file no-explicit-any
import { MiddlewareHandler, MiddlewareHandlerContext } from "../../../deps.ts";
import { fromEndpoint } from "../../../engine/releases/fetcher.ts";
import { DECO_FILE_NAME, newFsProvider } from "../../../engine/releases/fs.ts";
import { DecoContext, withContext } from "../../../deco.ts";
import { createResolver, newContext } from "../../../mod.ts";
import { Options } from "../../../plugins/deco.ts";
import { AppManifest, DecoSiteState, DecoState } from "../../../types.ts";

export const contextProvider = <TManifest extends AppManifest = AppManifest>(
  opt: Options<TManifest>,
): MiddlewareHandler<DecoState<any, DecoSiteState, TManifest>> => {
  const releaseProvider =
    opt?.useLocalStorageOnly || Deno.env.has("USE_LOCAL_STORAGE_ONLY")
      ? newFsProvider(DECO_FILE_NAME, opt.manifest.name)
      : opt.release;
  const rootManifest = {
    baseUrl: opt.manifest.baseUrl,
    name: opt.manifest.name,
    apps: { ...opt.manifest.apps },
  };
  const globalContextCreation = createResolver(
    rootManifest,
    opt.sourceMap,
    releaseProvider,
  );
  const contextCache: Record<string, Promise<DecoContext>> = {};

  return async function (
    request: Request,
    context: MiddlewareHandlerContext<
      DecoState<any, DecoSiteState, TManifest>
    >,
  ) {
    await globalContextCreation;
    const url = new URL(request.url);
    const inlineRelease = url.searchParams.get("__r");
    if (typeof inlineRelease === "string") {
      contextCache[inlineRelease] ??= newContext(
        rootManifest,
        opt.sourceMap,
        fromEndpoint(inlineRelease),
      );
      const ctx = await contextCache[inlineRelease];
      const next = withContext(ctx, context.next.bind(context));
      return next();
    }
    return context.next();
  };
};
