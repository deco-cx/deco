import { HandlerContext, PageProps } from "$fresh/server.ts";
import { Handler } from "$live/blocks/handler.ts";
import { PageInstance } from "$live/blocks/page.ts";
import { LiveConfig, LiveRouteConfig } from "$live/blocks/types.ts";

export default function Render({
  data: {
    component: { Component, props },
  },
}: PageProps<{ component: PageInstance }>) {
  return <Component {...props}></Component>;
}
export interface EntrypointConfig {
  handler: Handler;
}

export const handler = (
  req: Request,
  ctx: HandlerContext<
    unknown,
    LiveConfig<EntrypointConfig>
  >,
) => {
  const { state: { $live: { handler } } } = ctx;
  return handler(req, ctx);
};

export const config: LiveRouteConfig = {
  routeOverride: "/*",
};
