import { bodyFromUrl } from "../../../utils/http.ts";
import { invokeToHttpResponse } from "../../../utils/invoke.ts";
import type { InvokeFunction } from "../../../utils/invoke.types.ts";
import { createHandler } from "../middleware.ts";

import { payloadToResolvable, wrapInvokeErr } from "./batchInvoke.ts";

export const handler = createHandler(async (
  ctx,
): Promise<Response> => {
  const key = ctx.req.path.replace("/live/invoke/", "").replace(
    "/deco/invoke/",
    "",
  );
  const { req: { raw: req }, var: state } = ctx;
  const url = new URL(req.url); // TODO(mcandeia) check if ctx.url can be used here
  const props = req.method === "POST"
    ? req.headers.get("content-length") === "0" ? {} : await req.json()
    : bodyFromUrl("props", url);

  const { resolve } = state;
  const invokeFunc: InvokeFunction = {
    key: key as InvokeFunction["key"],
    props: props as InvokeFunction["props"],
    select:
      (url.searchParams.getAll("select") ?? []) as InvokeFunction["select"],
  };

  const resp = await resolve(payloadToResolvable(invokeFunc), {
    resolveChain: [{ type: "resolver", value: "invoke" }],
  }).catch(
    wrapInvokeErr(key),
  );

  return invokeToHttpResponse(req, resp);
});
