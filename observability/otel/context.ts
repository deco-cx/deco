import { AsyncLocalStorage } from "node:async_hooks";
import { createContextKey } from "../../deps.ts";

export const REQUEST_CONTEXT_KEY = createContextKey("Current Request");
export const STATE_CONTEXT_KEY = createContextKey("Application State");

interface RequestContext {
  url?: string;
  method?: string;
  pathname?: string;
  userAgent?: string;
  correlationId?: string;
}

export const requestContextStore = new AsyncLocalStorage<RequestContext>();

export const withRequestContext = <T>(
  context: RequestContext,
  fn: () => T,
): T => {
  return requestContextStore.run(context, fn);
};
