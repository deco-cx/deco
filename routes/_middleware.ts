import { MiddlewareHandlerContext } from "$fresh/server.ts";
import {
  getPagePathTemplate,
  redirectTo,
} from "$live/compatibility/v0/editorData.ts";
import { Resolvable } from "$live/engine/core/resolver.ts";
import { context } from "$live/live.ts";
import { LiveConfig, LiveState } from "$live/types.ts";
import { allowCorsFor, defaultHeaders } from "$live/utils/http.ts";
import { formatLog } from "$live/utils/log.ts";
import { getSetCookies } from "std/http/mod.ts";

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

export type Flags = Record<string, boolean>;
export const handler = async (
  req: Request,
  ctx: MiddlewareHandlerContext<LiveConfig<MiddlewareConfig, LiveState>>,
) => {
  const begin = performance.now();
  const url = new URL(req.url);
  let initialResponse: Response | null = null;
  try {
    ctx.state.site = {
      id: context.siteId,
      name: context.site,
    };

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
    const flags: Flags = {};
    const state = ctx.state?.$live?.state;
    if (state) {
      state.response = response;
      state.flags = flags;
      Object.assign(ctx.state, state);
      ctx.state.global = state; // compatibility mode with functions.
    }

    // Let rendering occur — handlers are responsible for calling ctx.state.loadPage
    initialResponse = await ctx.next();
    const newHeaders = new Headers(initialResponse.headers);
    if (
      url.pathname.startsWith("/live/previews") &&
      url.searchParams.has("mode") && url.searchParams.get("mode") == "showcase"
    ) {
      Object.entries(allowCorsFor(req)).map(([name, value]) => {
        newHeaders.set(name, value);
      });
    }
    response.headers.forEach((value, key) => newHeaders.append(key, value));
    const printTimings = ctx?.state?.t?.printTimings;
    printTimings && newHeaders.set("Server-Timing", printTimings());

    if (
      url.pathname.startsWith("/_frsh/") &&
      [400, 404, 500].includes(initialResponse.status)
    ) {
      newHeaders.set("Cache-Control", "no-cache, no-store, private");
    }

    for (const [flag, flagValue] of Object.entries(flags)) {
      newHeaders.append(
        "_dxcf_matchers",
        `${flag}=${flagValue ? 1 : 0}`,
      );
    }

    // if there's no set cookie it means that none unstable matcher was evaluated
    if (
      Object.keys(getSetCookies(newHeaders)).length === 0
    ) {
      newHeaders.set("cache-control", "public, max-age=10");
    }

    const newResponse = new Response(initialResponse.body, {
      status: initialResponse.status,
      headers: newHeaders,
    });

    return newResponse;
  } finally {
    // TODO: print these on debug mode when there's debug mode.
    if (!url.pathname.startsWith("/_frsh")) {
      console.info(
        formatLog({
          status: initialResponse?.status ?? 500,
          url,
          begin,
        }),
      );
    }
  }
};
