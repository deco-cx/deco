import { HandlerContext } from "$fresh/server.ts";
import { Page } from "$live/blocks/page.ts";
import { RouterContext } from "$live/types.ts";
import { allowCorsFor } from "$live/utils/http.ts";
import { ConnInfo } from "std/http/server.ts";

export interface FreshConfig {
  page: Page;
}

export const isFreshCtx = <TState>(
  ctx: ConnInfo | HandlerContext<unknown, TState>,
): ctx is HandlerContext<unknown, TState> => {
  return typeof (ctx as HandlerContext).render === "function";
};

/**
 * @title Fresh Page
 * @description Renders a fresh page.
 */
export default function Fresh(page: FreshConfig) {
  return (req: Request, ctx: ConnInfo) => {
    const url = new URL(req.url);
    if (url.searchParams.get("asJson") !== null) {
      return Response.json(page, { headers: allowCorsFor(req) });
    }
    return isFreshCtx<{ routerInfo: RouterContext }>(ctx)
      ? ctx.render({ ...page, routerInfo: ctx.state.routerInfo })
      : Response.json({ message: "Fresh is not being used" }, { status: 500 });
  };
}
