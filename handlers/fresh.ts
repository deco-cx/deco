import { HandlerContext } from "$fresh/server.ts";
import { Page } from "$live/blocks/page.ts";
import { ConnInfo } from "https://deno.land/std@0.170.0/http/server.ts";

export interface FreshConfig {
  page: Page;
}

const isFreshCtx = (ctx: ConnInfo | HandlerContext): ctx is HandlerContext => {
  return typeof (ctx as HandlerContext).render === "function";
};
export default function Fresh(page: FreshConfig) {
  return (_: Request, ctx: ConnInfo) =>
    isFreshCtx(ctx)
      ? ctx.render(page)
      : Response.json({ message: "Fresh is not being used" }, { status: 500 });
}
