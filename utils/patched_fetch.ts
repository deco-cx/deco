import { RequestContext } from "../deco.ts";

/**
 * Monkey patch fetch to add global cancellation token and timeout support.
 *
 * This patch addresses issue #1034 by ensuring that all fetch calls:
 * 1. Inherit the request-scoped AbortSignal from RequestContext (set in runtime/mod.ts)
 * 2. Have a fallback timeout to prevent indefinite hangs
 *
 * The timeout signal is combined with any provided signal using AbortSignal.any(),
 * ensuring that fetch calls are cancelled if either:
 * - The request timeout expires (REQUEST_TIMEOUT_MS)
 * - The individual fetch timeout expires (FETCH_TIMEOUT_MS)
 * - The caller provides a signal that aborts
 *
 * Configuration:
 * - FETCH_TIMEOUT_MS: Timeout for individual fetch operations (default 30s)
 */
const fetcher = globalThis.fetch;

// Default fetch timeout to prevent indefinite hangs (configurable via env var)
const FETCH_TIMEOUT_MS = parseInt(Deno.env.get("FETCH_TIMEOUT_MS") ?? "30000"); // 30 seconds default

type RequestInitWithSignal = (RequestInit | globalThis.RequestInit) & {
  signal?: AbortSignal;
};
const hasSignal = (
  init: RequestInitWithSignal | unknown,
): init is RequestInitWithSignal => {
  return init !== null && typeof init === "object" && ("signal" in init);
};

globalThis.fetch = (input, init) => {
  // Get the signal from init or RequestContext
  const providedSignal = hasSignal(init)
    ? init.signal || RequestContext.signal
    : RequestContext.signal;

  // Create a timeout signal for fetch operations
  const fetchTimeoutController = new AbortController();
  const fetchTimeoutId = setTimeout(() => fetchTimeoutController.abort(), FETCH_TIMEOUT_MS);

  // Combine provided signal with fetch timeout
  const signal = providedSignal
    ? AbortSignal.any([providedSignal, fetchTimeoutController.signal])
    : fetchTimeoutController.signal;

  signal?.throwIfAborted?.();

  // Clean up timeout when fetch completes
  const fetchPromise = fetcher(input, { signal, ...init });
  fetchPromise.finally(() => clearTimeout(fetchTimeoutId));

  return fetchPromise;
};
