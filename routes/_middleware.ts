import { MiddlewareHandlerContext } from "$fresh/server.ts";
import {
  getPagePathTemplate,
  previewSection,
  redirectTo,
} from "$live/compatibility/v0/editorData.ts";
import { context } from "$live/live.ts";
import { LiveState } from "$live/types.ts";
import { formatLog } from "$live/utils/log.ts";
import { createServerTimings } from "$live/utils/timings.ts";

export const previewPage = async (url: URL, pageId: string) => {
  url.searchParams.append("path", url.pathname);
  if (!url.searchParams.has("pathTemplate")) { // FIXM(mcandeia) compatibility mode only, once migrated pathTemplate is required because there are pages unpublished
    url.searchParams.append("pathTemplate", await getPagePathTemplate(pageId));
  }
  url.pathname = `/live/previews/${pageId}`;
  return redirectTo(url);
};

export const handler = async (
  req: Request,
  ctx: MiddlewareHandlerContext<LiveState>,
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
    return redirectTo(url);
  }

  if (
    url.pathname.startsWith("/_live/workbench") &&
    !url.searchParams.has("key") && !url.searchParams.has("pageId")
  ) {
    url.pathname = "/live/workbench";
    return redirectTo(url);
  }

  if (
    !url.pathname.startsWith("/live/previews") &&
    url.searchParams.has("pageId") &&
    !url.searchParams.has("editorData")
  ) {
    return previewPage(url, url.searchParams.get("pageId")!);
  }

  if (
    !url.pathname.startsWith("/live/previews") && url.searchParams.has("key") &&
    !url.searchParams.has("editorData")
  ) {
    return previewSection(url, url.searchParams.get("key")!);
  }

  const { start, end, printTimings } = createServerTimings();
  ctx.state.t = { start, end };

  // Let rendering occur — handlers are responsible for calling ctx.state.loadPage
  const initialResponse = await ctx.next();

  const newHeaders = new Headers(initialResponse.headers);
  newHeaders.set("Server-Timing", printTimings());

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
        pageId: ctx.state.page?.id,
        begin,
      }),
    );
  }

  return newResponse;
};
