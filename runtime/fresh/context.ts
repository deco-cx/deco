import type { HandlerContext } from "$fresh/server.ts";
import type { ConnInfo } from "std/http/server.ts";
export const isFreshCtx = <TState>(
  ctx: ConnInfo | HandlerContext<unknown, TState>,
): ctx is HandlerContext<unknown, TState> => {
  return typeof (ctx as HandlerContext).render === "function";
};
