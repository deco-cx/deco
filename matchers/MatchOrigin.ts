import { MatchContext } from "$live/blocks/matcher.ts";

export interface Props {
  includes?: string;
  match?: string;
}

const MatchOrigin = (
  { includes, match }: Props,
  { request }: MatchContext,
) => {
  const origin = request.headers.get("origin") || request.headers.get("host") ||
    "";
  const regexMatch = match ? new RegExp(match).test(origin) : true;
  const includesFound = includes ? origin.includes(includes) : true;

  return regexMatch && includesFound;
};

export default MatchOrigin;
