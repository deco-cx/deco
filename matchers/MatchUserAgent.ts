import { MatchContext } from "$live/blocks/matcher.ts";

export interface Props {
  includes?: string;
  match?: string;
}

const MatchUserAgent = (
  { includes, match }: Props,
  { request }: MatchContext
) => {
  const ua = request.headers.get("user-agent") || "";
  const regexMatch = match ? new RegExp(match).test(ua) : true;
  const includesFound = includes ? ua.includes(includes) : true;

  return regexMatch && includesFound;
};

export default MatchUserAgent;
