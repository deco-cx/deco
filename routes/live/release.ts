import { HandlerContext } from "$fresh/server.ts";
import { LiveConfig } from "../../mod.ts";

export const handler = async (
  _req: Request,
  ctx: HandlerContext<unknown, LiveConfig>,
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
