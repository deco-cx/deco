import { HandlerContext, PageProps } from "$fresh/server.ts";
import { Handler } from "$live/blocks/handler.ts";
import { PageInstance } from "$live/blocks/page.ts";
import { LiveRouteConfig } from "$live/blocks/types.ts";
import { Resolvable } from "$live/engine/core/resolver.ts";
import { context } from "$live/live.ts";

export default function Render({
  data: {
    component: { Component, props },
  },
}: PageProps<{ component: PageInstance }>) {
  return <Component {...props}></Component>;
}
export interface EntrypointConfig {
  handler: Handler;
  configState: Record<string, Resolvable>;
}

export const handler = (
  req: Request,
  ctx: HandlerContext,
) => {
  return context.configResolver!.resolve("Routes", {
    request: req,
    context: ctx,
  });
};

export const config: LiveRouteConfig = {
  routeOverride: "/*",
};
