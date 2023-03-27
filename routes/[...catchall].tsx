import { HandlerContext, PageProps } from "$fresh/server.ts";
import { Handler, LiveConfig } from "$live/blocks/handler.ts";
import { Page } from "$live/blocks/page.ts";
import { LiveRouteConfig } from "$live/blocks/route.ts";
import { PageContext } from "$live/engine/block.ts";
import { LiveState } from "$live/types.ts";
import { createContext } from "preact";
import { useContext } from "preact/hooks";
import { setCSPHeaders } from "$live/utils/http.ts";
import { $live } from "../engine/fresh/manifest.ts";
import { Resolvable } from "$live/engine/core/resolver.ts";

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
    page: { Component, props, metadata },
  },
}: PageProps<{ page: Page }>) {
  return (
    <ctx.Provider value={{ metadata, params, url }}>
      <Component {...props}></Component>
    </ctx.Provider>
  );
}

export interface Entrypoint {
  state: Record<string, Resolvable>;
  handler: Handler;
}

export const handler = async (
  req: Request,
  ctx: HandlerContext<
    unknown,
    LiveConfig<Entrypoint, LiveState>
  >,
) => {
  const { state: { $live: { handler, state } } } = ctx;
  if (typeof handler !== "function") {
    return Response.json({ "message": "catchall not configured" }, {
      status: 412, // precondition failed
    });
  }
  ctx.state = {
    ...ctx.state,
    ...(state ?? {}),
    global: state, // compatibility mode with functions.
  };

  return setCSPHeaders(
    req,
    await handler(req, ctx),
  );
};

export const config: LiveRouteConfig = {
  routeOverride: "/*",
};
