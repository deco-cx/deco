import { MatchFunction } from "$live/std/types.ts";
import { LiveState } from "$live/types.ts";

export interface Props {
  siteId: number;
}

const MatchSite: MatchFunction<Props, unknown, LiveState> = (
  _req,
  _ctx,
  props,
) => {
  return { isMatch: _ctx.state.site.id === props.siteId, duration: "request" };
};

export default MatchSite;
