/** @jsxRuntime automatic */
/** @jsxImportSource preact */

import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { Handler } from "../../blocks/handler.ts";
import type { Page } from "../../blocks/page.tsx";
import type { PageContext } from "../../engine/block.ts";
import type { Flag } from "../../types.ts";
import { forceHttps, setCSPHeaders } from "../../utils/http.ts";
import {
  createHandler,
  type DecoMiddlewareContext,
  proxyState,
} from "../middleware.ts";
import type { PageParams } from "../mod.ts";

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

export interface PageData {
  page: Page;
  routerInfo?: RouterContext;
}
export default function Render({
  params,
  url,
  data: {
    page,
    routerInfo,
  },
}: PageParams<PageData>) {
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
  const original = ctx.render.bind(ctx);
  ctx.render = ((args: PageData) => {
    return original({
      page: {
        metadata: args?.page?.metadata,
        Component: Render,
        props: {
          params: ctx.req.param(),
          url: ctx.var.url,
          data: {
            page: args.page,
            routerInfo: {
              flags: ctx.var.flags,
              pagePath: ctx.var.pathTemplate,
            },
          },
        } satisfies PageParams<PageData>,
      },
    });
  }) as typeof ctx["render"];

  return setCSPHeaders(
    req,
    await handler(
      forceHttps(req),
      proxyState(
        ctx as DecoMiddlewareContext,
      ) as unknown as Deno.ServeHandlerInfo,
    ),
  );
});
