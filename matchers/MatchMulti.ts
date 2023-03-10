import { MatchContext, Matcher } from "$live/blocks/matcher.ts";

export interface Props {
  op: "or" | "and";
  matchers: Matcher[];
}

const MatchMulti = ({ op, matchers }: Props) => (ctx: MatchContext) => {
  return op === "or"
    ? matchers.some((matcher) => matcher(ctx))
    : matchers.every((matcher) => matcher(ctx));
};

export default MatchMulti;
