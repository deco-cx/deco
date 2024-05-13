import type { HandlerContext } from "$fresh/server.ts";
import type { DecoSiteState, DecoState } from "../../../types.ts";
import { bodyFromUrl } from "../../../utils/http.ts";
import { invokeToHttpResponse } from "../../../utils/invoke.ts";
import type { InvokeFunction } from "../../../utils/invoke.types.ts";

import { payloadToResolvable, wrapInvokeErr } from "./batchInvoke.ts";

export const handler = async (
  req: Request,
  ctx: HandlerContext<
    unknown,
    DecoState<unknown, DecoSiteState>
  >,
): Promise<Response> => {
  const url = new URL(req.url); // TODO(mcandeia) check if ctx.url can be used here
  const props = req.method === "POST"
    ? req.headers.get("content-length") === "0" ? {} : await req.json()
    : bodyFromUrl("props", url);

  const { state: { resolve } } = ctx;
  const invokeFunc: InvokeFunction = {
    key: ctx.params.key as InvokeFunction["key"],
    props: props as InvokeFunction["props"],
    select:
      (url.searchParams.getAll("select") ?? []) as InvokeFunction["select"],
  };

  const resp = await resolve(payloadToResolvable(invokeFunc), {
    resolveChain: [{ type: "resolver", value: "invoke" }],
  }).catch(
    wrapInvokeErr(ctx.params.key),
  );

  return invokeToHttpResponse(req, resp);
};
