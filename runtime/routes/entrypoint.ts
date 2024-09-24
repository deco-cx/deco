import { createContext } from "preact";
import { useContext } from "preact/hooks";
import { jsx as _jsx } from "preact/jsx-runtime";
import type { Handler } from "../../blocks/handler.ts";
import type { Page } from "../../blocks/page.ts";
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

/**
 * Hook to access the page context.
 *
 * @returns {PageContext | undefined} The page context, or undefined if not available.
 */
export const usePageContext = (): PageContext | undefined => {
  const pageCtx = useContext(ctx);
  if (pageCtx === undefined) {
    console.warn(
      "page metadata requested but not available, are you using inside an island ?",
    );
  }
  return pageCtx;
};

/**
 * Hook to access the router context.
 *
 * @returns {RouterContext | undefined} The router context, or undefined if not available.
 */
export const useRouterContext = (): RouterContext | undefined => {
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
  return /*#__PURE__*/ _jsx(routerCtx.Provider, {
    value: routerInfo,
    children: /*#__PURE__*/ _jsx(ctx.Provider, {
      value: {
        metadata,
        params,
        url,
      },
      children: /*#__PURE__*/ _jsx(Component, {
        ...props,
      }),
    }),
  });
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
          data: args,
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
