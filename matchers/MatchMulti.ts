import { LiveConfig } from "$live/types.ts";
import { HandlerContext } from "$fresh/server.ts";
import { MatcherResult } from "$live/blocks/matcher.ts";

export interface Props {
  op: "or" | "and";
  matchers: MatcherResult[];
}

const MatchMulti = (
  _req: Request,
  {
    state: {
      $live: { op, matchers },
    },
  }: HandlerContext<unknown, LiveConfig<Props>>,
) => {
  return op === "or"
    ? matchers.some((matcher) => matcher)
    : matchers.every((matcher) => matcher);
};

export default MatchMulti;
