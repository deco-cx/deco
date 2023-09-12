import { HandlerContext, PageProps } from "$fresh/server.ts";
import { createContext } from "preact";
import { useContext } from "preact/hooks";
import { ConnInfo } from "std/http/server.ts";
import { Handler } from "../blocks/handler.ts";
import { Page } from "../blocks/page.ts";
import { PageContext } from "../engine/block.ts";
import { Flag, DecoState, DecoSiteState } from "../types.ts";
import { setCSPHeaders } from "../utils/http.ts";

export interface RouterContext {
  pagePath: string;
  flags: Flag[];
}
const ctx = createContext<PageContext | undefined>(undefined);

const routerCtx = createContext<RouterContext | undefined>(undefined);

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

export const handler = async (
  req: Request,
  ctx: HandlerContext<
    unknown,
    DecoState<Handler, DecoSiteState>
  >,
) => {
  const { state: { $live: handler } } = ctx;
  if (typeof handler !== "function") {
    return Response.json({ "message": "catchall not configured" }, {
      status: 412, // precondition failed
    });
  }

  return setCSPHeaders(
    req,
    await handler(req, ctx as ConnInfo),
  );
};
