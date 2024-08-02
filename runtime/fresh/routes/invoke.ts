import type { HandlerContext } from "$fresh/server.ts";
import { formDataToProps } from "deco/clients/formdata.ts";
import type { DecoSiteState, DecoState } from "../../../types.ts";
import { bodyFromUrl } from "../../../utils/http.ts";
import { invokeToHttpResponse } from "../../../utils/invoke.ts";
import type { InvokeFunction } from "../../../utils/invoke.types.ts";

import { payloadToResolvable, wrapInvokeErr } from "./batchInvoke.ts";

const propsParsers = {
  "json": async (req: Request) => await req.json() as Record<string, any>,
  "try-json": async (req: Request) => {
    try {
      return await req.json() as Record<string, any>;
    } catch (err) {
      console.warn("Error parsing props from request", err);
      return {};
    }
  },
  "form-data": async (req: Request) => {
    const formData = await req.formData();
    return formDataToProps(formData);
  },
  "search-params": async (req: Request) => {
    const url = new URL(req.url);
    return bodyFromUrl("props", url);
  },
};

function getParsingStrategy(req: Request): keyof typeof propsParsers | null {
  if (req.method !== "POST") {
    return "search-params";
  }

  const contentType = req.headers.get("content-type");
  const contentLength = req.headers.get("content-length");

  if (contentLength === "0" || !contentLength) {
    return null;
  }

  if (!contentType) {
    return "try-json";
  }

  if (contentType.startsWith("application/json")) {
    return "json";
  }

  if (contentType.startsWith("multipart/form-data")) {
    return "form-data";
  }

  return null;
}

async function parsePropsFromRequest(
  req: Request,
): Promise<Record<string, any>> {
  const strategy = getParsingStrategy(req);

  if (!strategy) {
    return {};
  }

  return await propsParsers[strategy](req);
}

export const handler = async (
  req: Request,
  ctx: HandlerContext<
    unknown,
    DecoState<unknown, DecoSiteState>
  >,
): Promise<Response> => {
  const url = new URL(req.url); // TODO(mcandeia) check if ctx.url can be used here
  const props = await parsePropsFromRequest(req);

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
