// deno-lint-ignore-file no-explicit-any
import { context } from "../../deco.ts";
import { allowCorsFor, type Resolvable } from "../../mod.ts";
import { logger } from "../../observability/mod.ts";
import { isAdminOrLocalhost } from "../../utils/admin.ts";
import { bodyFromUrl } from "../../utils/http.ts";
import { payloadForFunc } from "../../utils/invoke.server.ts";
import { invokeToHttpResponse } from "../../utils/invoke.ts";
import type {
  InvokeFunction,
  InvokePayload,
} from "../../utils/invoke.types.ts";
import { HttpError } from "../errors.ts";
import { createHandler } from "../middleware.ts";

export const wrapInvokeErr = (path?: string) => (err: any) => {
  if (!(err instanceof HttpError)) {
    if (context.isDeploy) {
      logger.error(`invoke error ${path}: ${err?.stack} ${err?.message}`);
    } else {
      console.error(`invoke error ${path}`, err);
    }
    throw new HttpError(
      new Response(
        err ? err : JSON.stringify({
          message: "Something went wrong.",
          code: "SWW",
        }),
        {
          status: 500,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );
  }
  throw err;
};
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
