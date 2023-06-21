import { MatchContext } from "$live/blocks/matcher.ts";

export interface Props {
  includes?: string;
  match?: string;
}

/**
 * @title Host Matcher
 */
const MatchHost = (
  { includes, match }: Props,
  { request }: MatchContext,
) => {
  const host = request.headers.get("host") || request.headers.get("origin") ||
    "";
  const regexMatch = match ? new RegExp(match).test(host) : true;
  const includesFound = includes ? host.includes(includes) : true;

  return regexMatch && includesFound;
};

export default MatchHost;
