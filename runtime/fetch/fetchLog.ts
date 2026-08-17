import { ValueType } from "../../deps.ts";
import { meter } from "../../observability/otel/metrics.ts";
import { formatOutgoingFetch } from "../../utils/log.ts";

let logger: null | ((_: string) => void) = null;

export const setLogger = (loggerLike: typeof logger) => logger = loggerLike;

/**
 * Duration of every outgoing fetch, dimensioned by the external host.
 *
 * This wrapper already measured the duration — it just threw it away unless a
 * logger happened to be installed, and the logger is null in production. So
 * there was no way to answer "is the external API slow, or are we making too
 * many calls to it?" from metrics; the only alternative was `otel_traces`,
 * which is tail-sampled and does not carry client spans for these calls at all.
 *
 * `unit: "ms"` is deliberate: the meter provider in
 * `observability/otel/metrics.ts` selects bucket boundaries by unit, so
 * declaring "ms" picks up `[10, 100, 500, 1000, 5000, 10000, 15000]`
 * automatically. Recording seconds here would land every observation in the
 * first bucket.
 *
 * Cardinality: `server.address` is the hostname, never the path — a storefront
 * talks to a handful of hosts (measured: 6 on a large VTEX store). Status is
 * bucketed into a class rather than the raw code, keeping this at roughly
 * 6 hosts x 5 classes per site.
 */
const outgoingFetchDuration = meter.createHistogram(
  "outgoing_fetch_duration",
  {
    description: "duration of outgoing fetch calls, by external host",
    unit: "ms",
    valueType: ValueType.DOUBLE,
  },
);

const statusClass = (status: number): string =>
  status >= 500 ? "5xx" : status >= 400 ? "4xx" : status >= 300 ? "3xx" : "2xx";

/**
 * Hostname of the request, or null when it cannot be derived. Returning null
 * keeps a malformed input from turning into a metric label — and from throwing
 * inside the fetch path, which would be a far worse failure than a missing
 * sample.
 *
 * `hostname`, not `host`: `host` appends a non-default port, so
 * `example.com:8080` and `example.com` would become two labels for one host and
 * inflate the very cardinality this metric is careful about. It also matches
 * semconv, where `server.address` is the address alone and `server.port` is a
 * separate attribute.
 *
 * The empty-string case is folded into null on purpose. Authority-less schemes
 * — `data:`, `blob:`, `file:` — parse fine but have no hostname, and recording
 * them would create a meaningless `server.address=""` series instead of simply
 * not sampling a call that never crossed the network.
 */
const hostOf = (input: string | Request | URL): string | null => {
  try {
    const url = typeof input === "string"
      ? new URL(input)
      : input instanceof URL
      ? input
      : new URL(input.url);
    return url.hostname || null;
  } catch {
    return null;
  }
};

export const createFetch = (fetcher: typeof fetch): typeof fetch =>
  async function fetch(
    input: string | Request | URL,
    init?: RequestInit,
  ) {
    const start = performance.now();
    const host = hostOf(input);

    const record = (status: string) => {
      if (host === null) return;
      outgoingFetchDuration.record(Math.round(performance.now() - start), {
        "server.address": host,
        "http.response.status_class": status,
      });
    };

    let response: Response;
    try {
      response = await fetcher(input, init);
    } catch (error) {
      // A throw here is an abort, a timeout or a transport failure. Those are
      // the samples worth having most — a call that hangs for 60s and then
      // aborts is invisible if only successful responses are recorded — so the
      // duration is kept and the error is re-thrown untouched.
      record("error");
      throw error;
    }

    record(statusClass(response.status));

    if (logger) {
      logger(
        formatOutgoingFetch(
          new Request(input, init),
          response,
          performance.now() - start,
        ),
      );
    }

    return response;
  };
