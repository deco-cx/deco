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
  const now = new Date();
  const start = new Date(props.start);
  const end = new Date(props.end);
  const isMatch = now > start && now < end;
  const duration = props.session ? "session" : "request";
  return { isMatch, duration };
};

export default MatchDate;
