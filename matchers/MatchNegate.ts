import { MatchContext, Matcher } from "../blocks/matcher.ts";

export interface Props {
  /**
   * @description Matcher to be negated.
   */
  matcher: Matcher;
}

/**
 * @title Matcher that negates another matcher.
 */
const MatchMulti = ({ matcher }: Props) => (ctx: MatchContext) => {
  return !matcher(ctx);
};

export default MatchMulti;