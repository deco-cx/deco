import { MatchFunction } from "$live/types.ts";

export interface Props {
  traffic: number;
  session: boolean;
}

const MatchRandom: MatchFunction<Props> = (
  _,
  __,
  props,
) => {
  const isMatch = Math.random() < props.traffic;
  const duration = props.session ? "session" : "request";
  return { isMatch, duration };
};

export default MatchRandom;
