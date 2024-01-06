// deno-lint-ignore-file no-explicit-any
import { MiddlewareHandler, MiddlewareHandlerContext } from "../../../deps.ts";
import { fromEndpoint } from "../../../engine/releases/fetcher.ts";
import { DECO_FILE_NAME, newFsProvider } from "../../../engine/releases/fs.ts";
import { DecoContext, withContext } from "../../../deco.ts";
import { createResolver, newContext } from "../../../mod.ts";
import { Options } from "../../../plugins/deco.ts";
import { AppManifest, DecoSiteState, DecoState } from "../../../types.ts";
import { getCookies, setCookie } from "std/http/mod.ts";

const DECO_RELEASE_COOKIE_NAME = "deco_release";
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
    const cookies = getCookies(request.headers);
    const inlineReleaseFromQs = url.searchParams.get("__r");
    const inlineReleaseFromCookie = cookies[DECO_RELEASE_COOKIE_NAME];
    const [inlineRelease, shouldAddCookie] = inlineReleaseFromQs != null
      ? [inlineReleaseFromQs, inlineReleaseFromQs !== inlineReleaseFromCookie]
      : [inlineReleaseFromCookie, false];
    if (typeof inlineRelease === "string") {
      contextCache[inlineRelease] ??= newContext(
        rootManifest,
        opt.sourceMap,
        fromEndpoint(inlineRelease),
      );
      const ctx = await contextCache[inlineRelease];
      const next = withContext(ctx, context.next.bind(context));
      const response = await next();
      if (shouldAddCookie) {
        setCookie(response.headers, {
          name: DECO_RELEASE_COOKIE_NAME,
          value: inlineRelease,
          path: "/",
          sameSite: "Strict",
        })
      }
      return response;
    }
    return context.next();
  };
};
