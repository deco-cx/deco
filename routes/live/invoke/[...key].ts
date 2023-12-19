import { HandlerContext } from "$fresh/server.ts";
import { DecoSiteState, DecoState } from "../../../types.ts";
import { bodyFromUrl } from "../../../utils/http.ts";
import { invokeToHttpResponse } from "../../../utils/invoke.ts";
import { InvokeFunction, payloadToResolvable, wrapInvokeErr } from "./index.ts";
export const handler = async (
  req: Request,
  ctx: HandlerContext<
    unknown,
    DecoState<unknown, DecoSiteState>
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

  const resp = await resolve(payloadToResolvable(invokeFunc)).catch(wrapInvokeErr);

  return invokeToHttpResponse(req, resp);
};
