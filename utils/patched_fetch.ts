import { RequestContext } from "../deco.ts";

// Monkey patch fetch so we can have global cancellation token
const fetcher = globalThis.fetch;

type RequestInitWithSignal = (RequestInit | globalThis.RequestInit) & {
  signal?: AbortSignal;
};
const hasSignal = (
  init: RequestInitWithSignal | unknown,
): init is RequestInitWithSignal => {
  return init !== null && typeof init === "object" && ("signal" in init);
};
globalThis.fetch = (input, init) => {
  const signal = hasSignal(init)
    ? init.signal || RequestContext.signal
    : RequestContext.signal;

  signal?.throwIfAborted?.();

  return fetcher(input, { signal, ...init });
};
