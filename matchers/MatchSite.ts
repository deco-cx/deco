import { LiveConfig } from "$live/blocks/types.ts";
import { HandlerContext } from "https://deno.land/x/fresh@1.1.2/server.ts";
import { LiveState } from "../types.ts";

export interface Props {
  siteId: number;
}

const MatchSite = (
  _req: Request,
  ctx: HandlerContext<unknown, LiveConfig<Props, LiveState>>,
) => {
  return {
    isMatch: ctx.state.site.id === ctx.state.$live.siteId,
    duration: "request",
  };
};

export default MatchSite;
