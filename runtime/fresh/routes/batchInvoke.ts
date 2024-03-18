// deno-lint-ignore-file no-explicit-any
import type { HandlerContext } from "$fresh/src/server/types.ts";
import type { Resolvable } from "../../../engine/core/resolver.ts";
import { HttpError } from "../../../engine/errors.ts";
import type { DecoState } from "../../../mod.ts";
import type { DecoSiteState } from "../../../types.ts";
import { isAdminOrLocalhost } from "../../../utils/admin.ts";
import { allowCorsFor, bodyFromUrl } from "../../../utils/http.ts";
import { payloadForFunc } from "../../../utils/invoke.server.ts";
import { invokeToHttpResponse } from "../../../utils/invoke.ts";
import type {
  InvokeFunction,
  InvokePayload,
} from "../../../utils/invoke.types.ts";

export const wrapInvokeErr = (err: any) => {
  if (!(err instanceof HttpError)) {
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

export const handler = async (
  req: Request,
  ctx: HandlerContext<
    unknown,
    DecoState<unknown, DecoSiteState>
  >,
): Promise<Response> => {
  const { state: { resolve } } = ctx;
  const data = req.method === "POST"
    ? await req.json()
    : bodyFromUrl("body", new URL(req.url)); // TODO(mcandeia) check if ctx.url can be used here

  const result = await resolve(payloadToResolvable(data)).catch(wrapInvokeErr);

  const response = invokeToHttpResponse(req, result);

  if (isAdminOrLocalhost(req)) {
    Object.entries(allowCorsFor(req)).map(([name, value]) => {
      response.headers.set(name, value);
    });
  }

  return response;
};
