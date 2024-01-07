// deno-lint-ignore-file no-explicit-any
import { deleteCookie, getCookies, setCookie } from "std/http/mod.ts";
import { DecoContext, withContext } from "../../../deco.ts";
import {
  MiddlewareHandler,
  MiddlewareHandlerContext,
  weakcache,
} from "../../../deps.ts";
import { fromEndpoint } from "../../../engine/releases/fetcher.ts";
import { DECO_FILE_NAME, newFsProvider } from "../../../engine/releases/fs.ts";
import { initContext, newContext } from "../../../mod.ts";
import { Options } from "../../../plugins/deco.ts";
import { AppManifest, DecoSiteState, DecoState } from "../../../types.ts";

interface Opts {
  cacheSize?: number;
}
class ContextCache extends weakcache.WeakLRUCache {
  constructor(options: Opts) {
    super(options);
  }
  onRemove(entry: { value: Promise<DecoContext> }): void { // dispose release on remove from cache
    entry?.value?.then?.((v) => v?.release?.dispose?.());
    super.onRemove(entry);
  }
}

let contextCache: ContextCache | null = null;

const DECO_RELEASE_COOKIE_NAME = "deco_release";
const DELETE_MARKER = "$";
export const contextProvider = <TManifest extends AppManifest = AppManifest>(
  opt: Options<TManifest>,
): MiddlewareHandler<DecoState<any, DecoSiteState, TManifest>> => {
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

  // Initialize global context
  const globalContextCreation = initContext(
    rootManifest,
    opt.sourceMap,
    releaseProvider,
  );

  // Return an async function to handle requests
  return async function (
    request: Request,
    context: MiddlewareHandlerContext<
      DecoState<any, DecoSiteState, TManifest>
    >,
  ) {
    // Wait for global context creation
    await globalContextCreation;

    // Parse the URL from the request
    const url = new URL(request.url);

    // Get the inline release from the query string
    const alienReleaseFromQs = url.searchParams.get("__r");

    // If the inline release is the delete marker, delete the cookie and return the response
    if (alienReleaseFromQs === DELETE_MARKER) {
      const response = await context.next();
      deleteCookie(response.headers, DECO_RELEASE_COOKIE_NAME);
      return response;
    }

    // Get the cookies from the request headers
    const cookies = getCookies(request.headers);

    // Get the inline release from the cookie
    const alienReleaseFromCookie = cookies[DECO_RELEASE_COOKIE_NAME];

    // Determine the inline release and whether a cookie should be added
    const [alienRelease, shouldAddCookie] = alienReleaseFromQs != null
      ? [alienReleaseFromQs, alienReleaseFromQs !== alienReleaseFromCookie]
      : [alienReleaseFromCookie, false];

    // If the inline release is a string, create a new context cache
    if (typeof alienRelease === "string") {
      contextCache ??= new ContextCache({
        cacheSize: 7, // 7 is arbitrarily chosen
      });
      let contextPromise: Promise<DecoContext> | undefined = contextCache.get(
        alienRelease,
      );
      if (!contextPromise) {
        contextPromise = newContext(
          rootManifest,
          opt.sourceMap,
          fromEndpoint(alienRelease),
          alienRelease,
        );
        contextCache.set(
          alienRelease,
          contextPromise.catch((err) => {
            console.error("context creation error", err);
            contextCache?.delete(alienRelease);
            throw err;
          }),
        );
      }
      const ctx = await contextPromise;
      const next = withContext(ctx, context.next.bind(context));
      const response = await next();
      if (shouldAddCookie) {
        setCookie(response.headers, {
          name: DECO_RELEASE_COOKIE_NAME,
          value: alienRelease,
          path: "/",
          sameSite: "Strict",
        });
      }
      return response;
    }
    return context.next();
  };
};
