import { RequestContext } from "deco/deco.ts";

// Monkey patch fetch so we can have global cancelation token
const fetcher = globalThis.fetch;

globalThis.fetch = (input, init) => {
  const signal = init?.signal || RequestContext.signal;

  if (signal?.aborted) {
    throw new DOMException(signal.reason, "AbortError");
  }
  if (
    input instanceof URL ||
    typeof input === "string" && (input.toString().startsWith("file:"))
  ) {
    console.log("requesting file", input);
  }

  return fetcher(input, { signal, ...init });
};
