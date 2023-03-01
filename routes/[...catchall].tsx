import { HandlerContext, PageProps } from "$fresh/server.ts";
import { PageInstance } from "$live/blocks/page.ts";
import { LiveRouteConfig, PreactComponent } from "$live/blocks/types.ts";
import { context } from "$live/live.ts";

export default function Render({
  data: {
    component: { Component, props },
  },
}: PageProps<{ component: PreactComponent<PageInstance> }>) {
  return <Component {...props}></Component>;
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
  routeOverride: "/live/*",
};
