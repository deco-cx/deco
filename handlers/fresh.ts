import { HandlerContext } from "$fresh/server.ts";
import { Page } from "$live/blocks/page.ts";
import { ConnInfo } from "std/http/server.ts";

export interface FreshConfig {
  page: Page;
}

export const isFreshCtx = <TState>(
  ctx: ConnInfo | HandlerContext<unknown, TState>,
): ctx is HandlerContext<unknown, TState> => {
  return typeof (ctx as HandlerContext).render === "function";
};
export default function Fresh(page: FreshConfig) {
  return (_: Request, ctx: ConnInfo) =>
    isFreshCtx(ctx)
      ? ctx.render(page)
      : Response.json({ message: "Fresh is not being used" }, { status: 500 });
}
