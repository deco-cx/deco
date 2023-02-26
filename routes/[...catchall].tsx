import { HandlerContext, PageProps } from "$fresh/server.ts";
import { LiveRouteConfig, PreactComponent } from "$live/blocks/types.ts";
import { context } from "$live/live.ts";
import { LiveConfig as LC } from "$live/blocks/types.ts";

export default function Render({
  data: {
    component: { Component, props },
  },
}: PageProps<{ component: PreactComponent }>) {
  return <Component {...props}></Component>;
}

export const handler = (
  req: Request,
  ctx: HandlerContext<unknown, LC<{ index: number }>>,
) => {
  return context.configResolver!.resolve("Routes", {
    request: req,
    context: ctx,
  });
};

export const config: LiveRouteConfig = {
  routeOverride: "/live/*",
  liveKey: "live",
};
