import { HandlerContext, PageProps } from "$fresh/server.ts";
import { createContext } from "preact";
import { useContext } from "preact/hooks";
import { ConnInfo } from "std/http/server.ts";
import { Handler } from "../../../blocks/handler.ts";
import { Page } from "../../../blocks/page.tsx";
import { PageContext } from "../../../engine/block.ts";
import { DecoSiteState, DecoState, Flag } from "../../../types.ts";
import { forceHttps, setCSPHeaders } from "../../../utils/http.ts";

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

const innerHandler = async (
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
    await handler(forceHttps(req), ctx as ConnInfo),
  );
};

export const handler = {
  POST: innerHandler,
  PUT: innerHandler,
  PATCH: innerHandler,
  OPTIONS: innerHandler,
  DELETE: innerHandler,
  // since fresh converts HEAD verbs into GET requests we need to explicitly handle it here
  HEAD: innerHandler,
  GET: innerHandler,
};
