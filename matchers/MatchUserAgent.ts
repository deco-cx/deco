import { MatchContext } from "$live/blocks/matcher.ts";

/**
 * @title {{includes}} {{match}}
 */
export interface Props {
  includes?: string;
  match?: string;
}

/**
 * @title User Agent Matcher
 */
const MatchUserAgent = (
  { includes, match }: Props,
  { request }: MatchContext,
) => {
  const ua = request.headers.get("user-agent") || "";
  const regexMatch = match ? new RegExp(match).test(ua) : true;
  const includesFound = includes ? ua.includes(includes) : true;

  return regexMatch && includesFound;
};

export default MatchUserAgent;
