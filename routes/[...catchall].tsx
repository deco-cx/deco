import { HandlerContext, PageProps } from "$fresh/server.ts";
import { Handler } from "$live/blocks/handler.ts";
import { Page } from "$live/blocks/page.ts";
import { PageContext } from "$live/engine/block.ts";
import { LiveConfig, LiveState, RouterContext } from "$live/types.ts";
import { setCSPHeaders } from "$live/utils/http.ts";
import { createContext } from "preact";
import { useContext } from "preact/hooks";

const ctx = createContext<PageContext | undefined>(undefined);

export const routerCtx = createContext<RouterContext | undefined>(undefined);

export const usePageContext = () => {
  const pageCtx = useContext(ctx);
  if (pageCtx === undefined) {
    console.warn(
      "page metadata requested but not available, are you using inside an island ?",
    );
  }
  return pageCtx;
};

export const useRouterContext = () => {
  const routerCtxImpl = useContext(routerCtx);
  if (routerCtxImpl === undefined) {
    console.warn(
      "router context requested but not available, are you using inside an island ?",
    );
  }
  return routerCtxImpl;
};

export default function Render({
  params,
  url,
  data: {
    page,
    routerInfo,
  },
}: PageProps<{ page: Page; routerInfo?: RouterContext }>) {
  if (!page) {
    return null;
  }
  const { Component, props, metadata } = page;
  return (
    <routerCtx.Provider value={routerInfo}>
      <ctx.Provider value={{ metadata, params, url }}>
        <Component {...props}></Component>
      </ctx.Provider>
    </routerCtx.Provider>
  );
}

/**
 * @description Site entrypoint, configure your audiences and routes.
 */
export interface Entrypoint {
  /**
   * @description configure how to handle requests.
   */
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
