import { HandlerContext, PageProps } from "$fresh/server.ts";
import { Handler, LiveConfig } from "$live/blocks/handler.ts";
import { Page } from "$live/blocks/page.ts";
import { LiveRouteConfig } from "$live/blocks/route.ts";
import { LiveState } from "$live/types.ts";

export default function Render({
  data: {
    page: { Component, props: pr, metadata },
  },
}: PageProps<{ page: Page }>) {
  const props = { ...pr, __metadata: metadata };
  return <Component {...props}></Component>;
}
export interface Entrypoint {
  handler: Handler;
}

export const handler = async (
  req: Request,
  ctx: HandlerContext<
    unknown,
    LiveConfig<Entrypoint, LiveState>
  >,
) => {
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
