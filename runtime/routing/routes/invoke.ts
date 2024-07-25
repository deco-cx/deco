import { bodyFromUrl } from "../../../utils/http.ts";
import { invokeToHttpResponse } from "../../../utils/invoke.ts";
import type { InvokeFunction } from "../../../utils/invoke.types.ts";
import type { DecoHandler } from "../middleware.ts";

import { payloadToResolvable, wrapInvokeErr } from "./batchInvoke.ts";

export const handler: DecoHandler = async (
  { req: { raw: req, param }, var: state },
): Promise<Response> => {
  const url = new URL(req.url); // TODO(mcandeia) check if ctx.url can be used here
  const props = req.method === "POST"
    ? req.headers.get("content-length") === "0" ? {} : await req.json()
    : bodyFromUrl("props", url);

  const { resolve } = state;
  const invokeFunc: InvokeFunction = {
    key: param("key") as InvokeFunction["key"],
    props: props as InvokeFunction["props"],
    select:
      (url.searchParams.getAll("select") ?? []) as InvokeFunction["select"],
  };

  const resp = await resolve(payloadToResolvable(invokeFunc), {
    resolveChain: [{ type: "resolver", value: "invoke" }],
  }).catch(
    wrapInvokeErr(param("key")),
  );

  return invokeToHttpResponse(req, resp);
};
