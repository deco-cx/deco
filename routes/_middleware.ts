import { MiddlewareHandlerContext } from "$fresh/server.ts";
import { context } from "$live/live.ts";
import { LiveState } from "$live/types.ts";
import { formatLog } from "$live/utils/log.ts";
import { createServerTimings } from "$live/utils/timings.ts";

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
