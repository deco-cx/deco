import { HandlerContext } from "$fresh/server.ts";
import { LiveConfig, LiveState } from "$live/types.ts";
import { bodyFromUrl } from "$live/utils/http.ts";
import { invokeToHttpResponse } from "$live/utils/invoke.ts";
import { InvokeFunction, payloadToResolvable } from "./index.ts";

export const handler = async (
  req: Request,
  ctx: HandlerContext<
    unknown,
    LiveConfig<unknown, LiveState>
  >,
): Promise<Response> => {
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

  const resp = await resolve(payloadToResolvable(invokeFunc));

  return invokeToHttpResponse(req, resp);
};
