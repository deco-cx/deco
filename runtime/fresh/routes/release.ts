import type { HandlerContext } from "$fresh/server.ts";
import type { DecoState } from "../../../mod.ts";

export const handler = async (
  _req: Request,
  ctx: HandlerContext<unknown, DecoState>,
) => {
  return new Response(
    JSON.stringify(await ctx.state.release.state()),
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
};
