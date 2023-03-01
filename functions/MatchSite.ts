import { MatchFunction } from "$live/types.ts";
import { LiveState } from "$live/types.ts";

export interface Props {
  siteId: number;
}

const MatchSite: MatchFunction<Props, unknown, LiveState> = (
  _req,
  ctx,
  props,
) => {
  return { isMatch: ctx.state.site.id === props.siteId, duration: "request" };
};

export default MatchSite;
