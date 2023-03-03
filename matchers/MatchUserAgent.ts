import { LiveConfig } from "$live/types.ts";
import { HandlerContext } from "$fresh/server.ts";

export interface Props {
  includes?: string;
  match?: string;
}

const MatchUserAgent = (
  req: Request,
  ctx: HandlerContext<unknown, LiveConfig<Props>>,
) => {
  const { match, includes } = ctx.state.$live;
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
