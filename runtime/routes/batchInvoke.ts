// deno-lint-ignore-file no-explicit-any

import type { Resolvable } from "../../mod.ts";

import { isAdminOrLocalhost } from "../../utils/admin.ts";
import { allowCorsFor, bodyFromUrl } from "../../utils/http.ts";

import { payloadForFunc } from "../../utils/invoke.server.ts";
import { invokeToHttpResponse } from "../../utils/invoke.ts";
import type {
  InvokeFunction,
  InvokePayload,
} from "../../utils/invoke.types.ts";
import { createHandler } from "../middleware.ts";

const isInvokeFunc = (
  p: InvokePayload<any> | InvokeFunction,
): p is InvokeFunction => {
  return (p as InvokeFunction).key !== undefined;
};

export const payloadToResolvable = (
  p: InvokePayload<any>,
): Resolvable => {
  if (isInvokeFunc(p)) {
    return payloadForFunc(p);
  }

  const resolvable: Resolvable = {};
  for (const [prop, invoke] of Object.entries(p)) {
    resolvable[prop] = payloadToResolvable(invoke);
  }
  return resolvable;
};

export const handler = createHandler(async (
  ctx,
): Promise<Response> => {
  const data = ctx.req.raw.method === "POST"
    ? await ctx.req.raw.json()
    : bodyFromUrl("body", ctx.var.url); // TODO(mcandeia) check if ctx.url can be used here

  const result = await ctx.var.deco.batchInvoke(
    data as Record<string, any>,
    ctx.var,
  );

  const response = invokeToHttpResponse(ctx.req.raw, result);

  if (isAdminOrLocalhost(ctx.req.raw)) {
    Object.entries(allowCorsFor(ctx.req.raw)).map(
      ([name, value]) => {
        response.headers.set(name, value);
      },
    );
  }

  return response;
});
