import { RequestContext } from "../deco.ts";

// Monkey patch fetch so we can have global cancelation token
const fetcher = globalThis.fetch;

globalThis.fetch = (input, init) => {
  const signal = init?.signal || RequestContext.signal;

  if (signal?.aborted) {
    throw new DOMException(signal.reason, "AbortError");
  }

  return fetcher(input, { signal, ...init });
};
