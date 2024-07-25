import { deleteCookie, getCookies, setCookie } from "std/http/mod.ts";
import { Context, type DecoContext } from "../../../deco.ts";
import { weakcache } from "../../../deps.ts";
import { fromEndpoint } from "../../../engine/decofile/fetcher.ts";
import { newContext } from "../../../mod.ts";
import { createMiddleware } from "../../hono/middleware.ts";

interface Opts {
  cacheSize?: number;
}
export class ContextCache extends weakcache.WeakLRUCache {
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
const COOKIE_MARKER = "@";
export const alienRelease = createMiddleware(async (context, next) => {
  // Parse the URL from the request
  const url = new URL(context.req.url);

  // Get the inline release from the query string
  const alienReleaseFromQs = url.searchParams.get("__r");
  const ref = context.req.header("referer");

  const referer = ref && URL.canParse(ref) ? new URL(ref) : null;
  const alienReleaseFromRef = referer?.searchParams.get("__r");
  const requesterAlienRelease = alienReleaseFromQs ?? alienReleaseFromRef;
  // If the inline release is the delete marker, delete the cookie and return the response
  if (requesterAlienRelease === DELETE_MARKER) {
    await next();
    const response = context.res;
    deleteCookie(response.headers, DECO_RELEASE_COOKIE_NAME);
    return response;
  }

  const cookable = requesterAlienRelease?.startsWith(COOKIE_MARKER) ?? false;
  const alienReleaseQs = cookable
    ? requesterAlienRelease!.slice(1) // remove @
    : requesterAlienRelease;

  // Get the cookies from the request headers
  const cookies = getCookies(context.req.raw.headers);

  // Get the inline release from the cookie
  const alienReleaseFromCookie = cookies[DECO_RELEASE_COOKIE_NAME];

  // Determine the inline release and whether a cookie should be added
  const [alienRelease, shouldAddCookie] = alienReleaseQs != null
    ? [
      alienReleaseQs,
      (alienReleaseQs !== alienReleaseFromCookie) && cookable,
    ]
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
      const active = Context.active();
      const { manifest, importMap } = await active.runtime!;
      contextPromise = newContext(
        manifest,
        importMap,
        fromEndpoint(alienRelease),
        alienRelease,
      );
      contextCache.setValue(
        alienRelease,
        contextPromise.catch((err) => {
          console.error("context creation error", err);
          contextCache?.delete(alienRelease);
          throw err;
        }),
      );
    }
    const ctx = await contextPromise;

    const mNext = Context.bind(ctx, next.bind(ctx));
    await mNext();
    const response = context.res;
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
  await next();
});
