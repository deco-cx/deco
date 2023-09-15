import { MatchContext, Matcher } from "deco/blocks/matcher.ts";

export interface Props {
  /**
   * @description Matcher to be negated.
   */
  matcher: Matcher;
}

/**
 * @title Negates a matcher
 */
const NegateMacher = ({ matcher }: Props) => (ctx: MatchContext) => {
  return !matcher(ctx);
};

export default NegateMacher;