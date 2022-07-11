import { MiddlewareHandlerContext } from "$fresh/server.ts";
import { DecoManifest, DecoState } from "$live/types.ts";
import manifest from "../deco.gen.ts";

export async function handler(
  _: Request,
  ctx: MiddlewareHandlerContext<DecoState>,
) {
  ctx.state.manifest = manifest as DecoManifest;
  return await ctx.next();
}
