import { HandlerContext } from "$fresh/server.ts";
import { LiveConfig, LiveState } from "$live/types.ts";
import { bodyFromUrl } from "$live/utils/http.ts";
import { InvokeFunction, payloadForFunc } from "./index.ts";

export const handler = async (
  req: Request,
  ctx: HandlerContext<
    unknown,
    LiveConfig<unknown, LiveState>
  >,
) => {
  const props = req.method === "POST"
    ? await req.json()
    : bodyFromUrl("props", new URL(req.url));

  const url = new URL(req.url);
  const { state: { resolve } } = ctx;
  const invokeFunc: InvokeFunction = {
    key: ctx.params.key as InvokeFunction["key"],
    props,
    select:
      (url.searchParams.getAll("select") ?? []) as InvokeFunction["select"],
  };

  return Response.json(
    await resolve(payloadForFunc(invokeFunc)),
  );
};
