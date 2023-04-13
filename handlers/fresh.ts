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
  return (req: Request, ctx: ConnInfo) => {
    const url = new URL(req.url);
    if (url.searchParams.get("asJson") !== null) {
      return Response.json(page);
    }

    if ("state" in ctx) {
      const liveState = ctx as {state: {
        $live: {
          pagePath: string;
          flags: string;
        };
      }}
      if ("$live" in liveState["state"]) {
        page.page.metadata['pagePath'] = liveState["state"]["$live"]["pagePath"];
        page.page.metadata['flags'] = liveState["state"]["$live"]["flags"];
      }
    }

    return isFreshCtx(ctx)
      ? ctx.render(page)
      : Response.json({ message: "Fresh is not being used" }, { status: 500 });
  };
}
