// deno-lint-ignore-file no-explicit-any
import { context } from "../../deco.ts";
import type { Resolvable } from "../../engine/core/resolver.ts";
import { forbidden, HttpError } from "../../engine/errors.ts";
import {
  blockTypeOf,
  isInvocableBlockType,
} from "../../engine/manifest/defaults.ts";
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

/**
 * Converts an invoke payload into a resolvable object.
 *
 * @param {InvokePayload<any>} p - The invoke payload.
 * @returns {Resolvable} The resolvable object.
 */
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

const MAX_PAYLOAD_DEPTH = 64;

/**
 * Invoke payloads come from the request, and the resolver resolves every
 * `__resolveType` nested in their props before the invoked block runs, so the
 * `invoke` resolver's own check would come too late for them. Refuse any that
 * names a block `invoke` may not call (see INVOCABLE_BLOCK_TYPES).
 */
const assertInvocablePayload = async (
  payload: unknown,
  state: State<any>,
): Promise<void> => {
  const resolveTypes = new Set<string>();
  const walk = (value: unknown, depth: number) => {
    if (value === null || typeof value !== "object") return;
    if (depth > MAX_PAYLOAD_DEPTH) {
      throw forbidden({ code: "403", message: "Invoke payload too deep" });
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    for (const [key, item] of Object.entries(value)) {
      if (key === "__resolveType" && typeof item === "string") {
        resolveTypes.add(item);
      } else {
        walk(item, depth + 1);
      }
    }
  };
  walk(payload, 0);
  if (resolveTypes.size === 0) return;

  const runtime = await context.runtime;
  if (!runtime) {
    throw forbidden({ code: "403", message: "Block is not invocable" });
  }
  const resolvers = runtime.resolver.getResolvers();
  const resolvables = await state.resolve({
    __resolveType: "resolvables",
  }) as Record<string, Resolvable>;
  for (const resolveType of resolveTypes) {
    if (
      !isInvocableBlockType(blockTypeOf(resolveType, resolvers, resolvables))
    ) {
      throw forbidden({ code: "403", message: "Block is not invocable" });
    }
  }
};

/**
 * Invokes multiple payloads in a batch.
 *
 * @param {InvokePayload<any>} payload - The batch payload containing invocations.
 * @param {State<any>} state - The application state.
 * @returns {Promise<any>} Promise resolving to the result of the batch invocation.
 */
export const batchInvoke = async (
  payload: InvokePayload<any>,
  state: State<any>,
): Promise<any> => {
  await assertInvocablePayload(payload, state);
  return await state.resolve(
    payloadToResolvable(payload),
    {
      resolveChain: [{ type: "resolver", value: "invoke" }],
    },
  ).catch(wrapInvokeErr(state.correlationId ?? crypto.randomUUID()));
};

/**
 * Invokes a function within the application state.
 *
 * @param {InvokeFunction["key"]} key - The key of the function to invoke.
 * @param {InvokeFunction["props"]} props - Props to be passed to the function.
 * @param {InvokeFunction["select"]} select - The selection path for the function.
 * @param {State<any>} state - The application state.
 * @returns {Promise<any>} Promise resolving to the result of the invocation.
 */
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
  await assertInvocablePayload(props, state);

  return await state.resolve(payloadToResolvable(invokeFunc), {
    resolveChain: [{ type: "resolver", value: "invoke" }],
  }).catch(
    wrapInvokeErr(state.correlationId ?? crypto.randomUUID(), key),
  );
};
