import type { ConnInfo } from "std/http/server.ts";
import type { HandlerContext } from "../../engine/manifest/manifest.ts";
export const isRenderAvailable = <TState>(
  ctx: ConnInfo | HandlerContext<unknown, TState>,
): ctx is HandlerContext<unknown, TState> => {
  return typeof (ctx as HandlerContext).render === "function";
};
