import { MiddlewareHandlerContext } from "$fresh/server.ts";
import {
  getPagePathTemplate,
  redirectTo,
} from "$live/compatibility/v0/editorData.ts";
import { Resolvable } from "$live/engine/core/resolver.ts";
import { context } from "$live/live.ts";
import { LiveConfig, LiveState } from "$live/types.ts";
import { defaultHeaders } from "$live/utils/http.ts";
import { formatLog } from "$live/utils/log.ts";

export const redirectToPreviewPage = async (url: URL, pageId: string) => {
  url.searchParams.append("path", url.pathname);
  url.searchParams.set("forceFresh", "");
  if (!url.searchParams.has("pathTemplate")) { // FIXM(mcandeia) compatibility mode only, once migrated pathTemplate is required because there are pages unpublished
    url.searchParams.append("pathTemplate", await getPagePathTemplate(pageId));
  }
  url.pathname = `/live/previews/${pageId}`;
  return redirectTo(url);
};

/**
 * @description Global configurations for ./routes/_middleware.ts route
 */
export interface MiddlewareConfig {
  /**
   * @description Configure your loaders global state.
   */
  state: Record<string, Resolvable>;
}

export const handler = async (
  req: Request,
  ctx: MiddlewareHandlerContext<LiveConfig<MiddlewareConfig, LiveState>>,
) => {
  ctx.state.site = {
    id: context.siteId,
    name: context.site,
  };

  const begin = performance.now();
  const url = new URL(req.url);
  // FIXME (mcandeia) compatibility only.
  if (
    url.searchParams.has("editorData") &&
    !url.pathname.startsWith("/live/editorData")
  ) {
    url.pathname = "/live/editorData";
    url.searchParams.set("forceFresh", "");
    return redirectTo(url);
  }

  if (url.pathname.startsWith("/_live/workbench")) {
    url.pathname = "/live/workbench";
    return redirectTo(url);
  }

  if (
    !url.pathname.startsWith("/live/previews") &&
    url.searchParams.has("pageId") &&
    !url.searchParams.has("editorData")
  ) {
    return redirectToPreviewPage(url, url.searchParams.get("pageId")!);
  }

  const response = { headers: new Headers(defaultHeaders) };
  const state = ctx.state?.$live?.state;
  if (state) {
    state.response = response;
    Object.assign(ctx.state, state);
    ctx.state.global = state; // compatibility mode with functions.
  }

  // Let rendering occur — handlers are responsible for calling ctx.state.loadPage
  const initialResponse = await ctx.next();

  const newHeaders = new Headers(initialResponse.headers);
  response.headers.forEach((value, key) => newHeaders.append(key, value));
  newHeaders.set("Server-Timing", ctx?.state?.t?.printTimings());

  if (
    url.pathname.startsWith("/_frsh/") &&
    [400, 404, 500].includes(initialResponse.status)
  ) {
    newHeaders.set("Cache-Control", "no-cache, no-store, private");
  }

  const newResponse = new Response(initialResponse.body, {
    status: initialResponse.status,
    headers: newHeaders,
  });

  // TODO: print these on debug mode when there's debug mode.
  if (!url.pathname.startsWith("/_frsh")) {
    console.info(
      formatLog({
        status: initialResponse.status,
        url,
        begin,
      }),
    );
  }

  return newResponse;
};
