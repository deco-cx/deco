import { MatchFunction } from "$live/std/types.ts";
import { LiveState } from "$live/types.ts";

export interface Props {
  traffic: number;
  session: boolean;
}

const RandomMatch: MatchFunction<Props, LiveState> = (_, __, props) => {
  const isMatch = Math.random() < props.traffic;
  const duration = props.session ? "session" : "request";
  return { isMatch, duration };
};

export default RandomMatch;
