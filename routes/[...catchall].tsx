import { HandlerContext, PageProps } from "$fresh/server.ts";
import { Handler } from "$live/blocks/handler.ts";
import { Page } from "$live/blocks/page.ts";
import { LiveRouteConfig } from "$live/blocks/route.ts";
import { PageContext } from "$live/engine/block.ts";
import { LiveConfig, LiveState } from "$live/types.ts";
import { setCSPHeaders } from "$live/utils/http.ts";
import { createContext } from "preact";
import { useContext } from "preact/hooks";

const ctx = createContext<PageContext | undefined>(undefined);

export const usePageContext = () => {
  const pageCtx = useContext(ctx);
  if (pageCtx === undefined) {
    console.warn(
      "page metadata requested but not available, are you using inside an island ?",
    );
  }
  return pageCtx;
};

export default function Render({
  params,
  url,
  data: {
    page,
  },
}: PageProps<{ page: Page }>) {
  if (!page) {
    return null; /// sabemos todos os loaders
  }
  const { Component, props, metadata } = page;
  return (
    <ctx.Provider value={{ metadata, params, url }}>
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

  return setCSPHeaders(
    req,
    await handler(req, ctx),
  );
};

export const config: LiveRouteConfig = {
  routeOverride: "/*",
};
