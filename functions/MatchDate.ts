import { MatchFunction } from "$live/std/types.ts";

export interface Props {
  start: Date;
  end: Date;
  session: boolean;
}

const MatchDate: MatchFunction<Props> = (
  _,
  __,
  props,
) => {
  console.log("MatchDate", props);
  const now = new Date();
  const isMatch = now > props.start && now < props.end;
  const duration = props.session ? "session" : "request";
  return { isMatch, duration };
};

export default MatchDate;
