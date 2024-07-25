import type { PageProps } from "$fresh/server.ts";
import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { ConnInfo } from "std/http/mod.ts";
import type { Handler } from "../../../blocks/handler.ts";
import type { Page } from "../../../blocks/page.tsx";
import type { PageContext } from "../../../engine/block.ts";
import type { Flag } from "../../../types.ts";
import { forceHttps, setCSPHeaders } from "../../../utils/http.ts";
import {
  createHandler,
  type DecoMiddlewareContext,
  proxyState,
} from "../middleware.ts";

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

export const handler = createHandler(async (
  ctx,
) => {
  const { req: { raw: req }, var: state } = ctx;
  const handler = (await state?.resolve<Handler>?.(
    "./routes/[...catchall].tsx",
    { nullIfDangling: true },
  )) ?? {};
  if (typeof handler !== "function") {
    return Response.json({ "message": "catchall not configured" }, {
      status: 412, // precondition failed
    });
  }

  return setCSPHeaders(
    req,
    await handler(
      forceHttps(req),
      proxyState(ctx as DecoMiddlewareContext) as unknown as ConnInfo,
    ),
  );
});
