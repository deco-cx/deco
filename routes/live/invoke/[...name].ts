import { HandlerContext } from "$fresh/src/server/types.ts";
import { LiveConfig } from "$live/blocks/handler.ts";
import { LiveState } from "$live/types.ts";

export const handler = async (
  req: Request,
  ctx: HandlerContext<
    unknown,
    LiveConfig<unknown, LiveState>
  >,
) => {
  const { state: { resolve } } = ctx;
  const props = req.method === "POST" ? await req.json() : {};

  return Response.json(
    await resolve({
      props,
      resolveType: ctx.params.name,
      __resolveType: "runWithMergedProps",
    }),
  );
};
