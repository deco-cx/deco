import { RequestContext } from "../deco.ts";

// Monkey patch fetch so we can have global cancelation token
const fetcher = globalThis.fetch;

globalThis.fetch = (input, init) => {
  const signal = init?.signal || RequestContext.signal;

  signal?.throwIfAborted?.();

  return fetcher(input, { signal, ...init });
};
