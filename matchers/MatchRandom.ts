import { HandlerContext } from "$fresh/server.ts";
import { LiveConfig } from "$live/types.ts";

export interface Props {
  traffic: number;
  session: boolean;
}

const MatchRandom = (
  _req: Request,
  {
    state: {
      $live: { traffic, session },
    },
  }: HandlerContext<unknown, LiveConfig<Props>>,
) => {
  const isMatch = Math.random() < traffic;
  const duration = session ? "session" : "request";
  return { isMatch, duration };
};

export default MatchRandom;
