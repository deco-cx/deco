import { RequestContext } from "../deco.ts";
import { logger } from "../observability/otel/config.ts";

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

/**
 * Extracts the app name from a block ID.
 * e.g., "vtex/loaders/product/productList.ts" -> "vtex"
 */
const extractAppName = (blockId: string | undefined): string | undefined => {
  if (!blockId) return undefined;
  const firstSlash = blockId.indexOf("/");
  return firstSlash > 0 ? blockId.substring(0, firstSlash) : blockId;
};

/**
 * Extracts URL string from fetch input without consuming the body.
 */
const extractUrl = (input: RequestInfo | URL): string => {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url; // Request object
};

/**
 * Extracts HTTP method from fetch input/init without consuming the body.
 */
const extractMethod = (
  input: RequestInfo | URL,
  init?: RequestInit,
): string => {
  if (init?.method) return init.method;
  if (input instanceof Request) return input.method;
  return "GET"; // Default method
};

/**
 * Parses a URL and returns host and path (without query string or hash).
 * Returns undefined values if URL is invalid or relative.
 */
const parseUrlParts = (
  urlStr: string,
): { host: string | undefined; path: string | undefined } => {
  try {
    const url = new URL(urlStr);
    return { host: url.host, path: url.pathname };
  } catch {
    // Relative URL or invalid - return as-is in path
    return { host: undefined, path: urlStr.split("?")[0].split("#")[0] };
  }
};

/**
 * Event emitted when a fetch call is made.
 * Can be used for monitoring/observability of external API calls.
 */
export interface FetchEvent {
  /** The app that made the fetch call (e.g., "vtex", "shopify") */
  app: string | undefined;
  /** The block (loader/action) that made the fetch call */
  blockId: string | undefined;
  /** The URL being fetched */
  url: string;
  /** HTTP method */
  method: string;
  /** Timestamp when the fetch started */
  startedAt: number;
}

/**
 * Event emitted when a fetch call completes (success or failure).
 */
export interface FetchCompleteEvent extends FetchEvent {
  /** HTTP status code of the response (0 if request failed before getting a response) */
  status: number;
  /** Whether the response was successful (2xx) */
  ok: boolean;
  /** Duration in milliseconds */
  durationMs: number;
  /** Error message if the request failed */
  error?: string;
}

type FetchListener = (event: FetchCompleteEvent) => void;

const listeners: FetchListener[] = [];

/**
 * Subscribe to fetch events for monitoring purposes.
 * Returns an unsubscribe function.
 */
export const onFetch = (listener: FetchListener): () => void => {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  };
};

const notifyListeners = (event: FetchCompleteEvent) => {
  // Iterate over a copy to safely handle listeners that unsubscribe during iteration
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch {
      // Ignore listener errors to not break fetch
    }
  }
};

// Register default logging listener with OTEL structured fields
onFetch((event) => {
  const logFn = event.error ? logger.error : logger.info;
  const { host, path } = parseUrlParts(event.url);

  logFn.call(logger, "outgoing fetch", {
    "fetch.app": event.app,
    "fetch.block_id": event.blockId,
    "fetch.host": host,
    "fetch.path": path,
    "fetch.method": event.method,
    "fetch.status": event.status,
    "fetch.ok": event.ok,
    "fetch.duration_ms": Math.round(event.durationMs),
    ...(event.error && { "fetch.error": event.error }),
  });
});

globalThis.fetch = async (input, init) => {
  const signal = hasSignal(init)
    ? init.signal || RequestContext.signal
    : RequestContext.signal;

  signal?.throwIfAborted?.();

  const blockId = RequestContext.blockId;
  const app = extractAppName(blockId);
  // Extract URL and method without constructing a Request (which would consume the body)
  const url = extractUrl(input);
  const method = extractMethod(input, init);
  const startedAt = performance.now();

  try {
    // Spread init first, then signal, so computed signal takes precedence over init.signal: undefined
    const response = await fetcher(input, { ...init, signal });

    // Notify listeners on success
    if (listeners.length > 0) {
      notifyListeners({
        app,
        blockId,
        url,
        method,
        startedAt,
        status: response.status,
        ok: response.ok,
        durationMs: performance.now() - startedAt,
      });
    }

    return response;
  } catch (err) {
    // Notify listeners on failure
    if (listeners.length > 0) {
      notifyListeners({
        app,
        blockId,
        url,
        method,
        startedAt,
        status: 0,
        ok: false,
        durationMs: performance.now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    throw err; // Re-throw to preserve original behavior
  }
};
