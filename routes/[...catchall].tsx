import { HandlerContext, PageProps } from "$fresh/server.ts";
import { Handler } from "$live/blocks/handler.ts";
import { PageInstance } from "$live/blocks/page.ts";
import { LiveConfig, LiveRouteConfig } from "$live/blocks/types.ts";
import { context } from "../live.ts";
import { loadGlobal } from "../pages.ts";
import getSupabaseClient from "../supabase.ts";
import { LiveState } from "../types.ts";

export default function Render({
  data: {
    page: { Component, props },
  },
}: PageProps<{ page: PageInstance }>) {
  return <Component {...props}></Component>;
}
export interface Entrypoint {
  handler: Handler;
}

// FIXME POC Only, REMOVE IT
const { data: pages } = await getSupabaseClient()
  .from("pages")
  .select("id, name, data, path, state")
  .eq("site", context.siteId)
  .in("state", ["published", "draft", "global"]);
const globalSettings = pages?.filter((page) => page.state === "global") ??
  [];
export const handler = async (
  req: Request,
  ctx: HandlerContext<
    unknown,
    LiveConfig<Entrypoint, LiveState>
  >,
) => {
  ctx.state.global = loadGlobal({ globalSettings });
  const { state: { $live: { handler } } } = ctx;
  if (typeof handler !== "function") {
    return Response.json({ "message": "catchall not configured" }, {
      status: 412, // precondition failed
    });
  }
  return await handler(req, ctx);
};

export const config: LiveRouteConfig = {
  routeOverride: "/*",
};
