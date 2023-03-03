import { HandlerContext } from "$fresh/server.ts";

const MatchAlways = (_req: Request, _ctx: HandlerContext) => {
  return true;
};

export default MatchAlways;
