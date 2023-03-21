import { HandlerContext, PageProps } from "$fresh/server.ts";
import { Handler, LiveConfig } from "$live/blocks/handler.ts";
import { Page } from "$live/blocks/page.ts";
import { LiveRouteConfig } from "$live/blocks/route.ts";
import { ComponentMetadata } from "$live/engine/block.ts";
import { LiveState } from "$live/types.ts";
import { createContext } from "preact";
import { useContext } from "preact/hooks";

const ctx = createContext<ComponentMetadata | undefined>(undefined);

export const usePageMetadata = () => {
  const metadata = useContext(ctx);
  if (metadata === undefined) {
    console.warn(
      "page metadata requested but not available, are you using inside an island ?",
    );
  }
  return metadata;
};

export default function Render({
  data: {
    page: { Component, props, metadata },
  },
}: PageProps<{ page: Page }>) {
  return (
    <ctx.Provider value={metadata}>
      <Component {...props}></Component>
    </ctx.Provider>
  );
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
