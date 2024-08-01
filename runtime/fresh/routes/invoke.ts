import type { HandlerContext } from "$fresh/server.ts";
import { formDataToProps } from "deco/clients/formdata.ts";
import type { DecoSiteState, DecoState } from "../../../types.ts";
import { bodyFromUrl } from "../../../utils/http.ts";
import { invokeToHttpResponse } from "../../../utils/invoke.ts";
import type { InvokeFunction } from "../../../utils/invoke.types.ts";

import { payloadToResolvable, wrapInvokeErr } from "./batchInvoke.ts";

const PROPS_FROM_REQUEST_STRATEGIES = {
  "json": async (req: Request) => await req.json() as Record<string, any>,
  "form-data": async (req: Request) => {
    const formData = await req.formData();
    return formDataToProps(formData);
  },
};

async function parsePropsFromRequest(
  req: Request,
): Promise<Record<string, any>> {
  const contentType = req.headers.get("content-type");
  const contentLength = req.headers.get("content-length");

  if (contentLength === "0") {
    return {};
  }

  if (contentType === "application/json") {
    return await PROPS_FROM_REQUEST_STRATEGIES["json"](req);
  }

  if (contentType?.startsWith("multipart/form-data")) {
    return await PROPS_FROM_REQUEST_STRATEGIES["form-data"](req);
  }

  return {};
}

export const handler = async (
  req: Request,
  ctx: HandlerContext<
    unknown,
    DecoState<unknown, DecoSiteState>
  >,
): Promise<Response> => {
  const url = new URL(req.url); // TODO(mcandeia) check if ctx.url can be used here
  const props = req.method === "POST"
    ? await parsePropsFromRequest(req)
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
