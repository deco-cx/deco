import { MatchFunction } from "$live/std/types.ts";
import { LiveState } from "$live/types.ts";

export interface Props {
  includes?: string;
  match?: string;
}

const MatchUserAgent: MatchFunction<Props, unknown, LiveState> = (
  req,
  __ctx,
  { includes, match }: Props,
) => {
  const ua = req.headers.get("user-agent") || "";
  const regexMatch = match ? new RegExp(match).test(ua) : true;
  const includesFound = includes ? ua.includes(includes) : true;

  return {
    // If both match and includes are provided, both must be true.
    isMatch: regexMatch && includesFound,
    duration: "request",
  };
};

export default MatchUserAgent;
