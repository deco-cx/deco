// deno-lint-ignore-file no-explicit-any
import type { Resolvable } from "../../engine/core/resolver.ts";
import { HttpError } from "../../engine/errors.ts";
import { context } from "../../live.ts";
import { logger } from "../../observability/mod.ts";
import { payloadForFunc } from "../../utils/invoke.server.ts";
import type {
  InvokeFunction,
  InvokePayload,
} from "../../utils/invoke.types.ts";
import type { State } from "../mod.ts";

export const wrapInvokeErr =
  (correlationId: string, path?: string) => (err: any) => {
    if (!(err instanceof HttpError)) {
      if (context.isDeploy) {
        logger.error(`invoke error ${path}: ${err?.stack} ${err?.message}`, {
          correlationId,
        });
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
              "x-correlation-id": correlationId,
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

export const batchInvoke = (
  payload: InvokePayload<any>,
  state: State<any>,
): Promise<any> => {
  return state.resolve(
    payloadToResolvable(payload),
    {
      resolveChain: [{ type: "resolver", value: "invoke" }],
    },
  ).catch(wrapInvokeErr(state.correlationId ?? crypto.randomUUID()));
};

export const invoke = async (
  key: InvokeFunction["key"],
  props: InvokeFunction["props"],
  select: InvokeFunction["select"],
  state: State<any>,
): Promise<any> => {
  const invokeFunc = {
    key,
    props,
    select,
  };

  return await state.resolve(payloadToResolvable(invokeFunc), {
    resolveChain: [{ type: "resolver", value: "invoke" }],
  }).catch(
    wrapInvokeErr(state.correlationId ?? crypto.randomUUID(), key),
  );
};
