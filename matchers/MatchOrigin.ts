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
  console.log("ORIGIN", origin);
  const regexMatch = match ? new RegExp(match).test(origin) : true;
  console.log("REGEX MATCH", regexMatch);
  const includesFound = includes ? origin.includes(includes) : true;

  console.log("INCLUDES", includes, includesFound, origin.includes(includes));

  return regexMatch && includesFound;
};

export default MatchOrigin;
