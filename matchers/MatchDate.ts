import { LiveConfig } from "$live/types.ts";
import { HandlerContext } from "$fresh/server.ts";

export interface Props {
  /**
   * @format date-time
   */
  start?: string;
  /**
   * @format date-time
   */
  end?: string;
  session: boolean;
}

const MatchDate = (
  _req: Request,
  { state: { $live: props } }: HandlerContext<unknown, LiveConfig<Props>>,
) => {
  const now = new Date();
  const start = props.start ? now > new Date(props.start) : true;
  const end = props.end ? now < new Date(props.end) : true;
  const duration = props.session ? "session" : "request";
  return { isMatch: start && end, duration };
};

export default MatchDate;
