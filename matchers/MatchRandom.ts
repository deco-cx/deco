import { MatchContext } from "$live/blocks/matcher.ts";
export interface Props {
  traffic: number;
}

/**
 * @title Random Matcher
 */
const MatchRandom = (
  { traffic }: Props,
  { isMatchFromCookie }: MatchContext,
) => {
  if (isMatchFromCookie !== undefined) {
    return isMatchFromCookie;
  }
  return Math.random() < traffic;
};

export default MatchRandom;
