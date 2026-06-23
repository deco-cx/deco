import { ValueType } from "../deps.ts";
import { meter } from "./otel/metrics.ts";

const httpDuration = meter.createHistogram("http_request_duration", {
  description: "http request duration",
  unit: "ms",
  valueType: ValueType.DOUBLE,
});

const httpResponseBytes = meter.createHistogram("http_response_bytes", {
  description: "http response body size in bytes (per route)",
  unit: "By",
  valueType: ValueType.INT,
});

/**
 * Records the response body size for a route. Egress per route is otherwise
 * unobservable: istio byte metrics carry no path label. Call after the body
 * has been fully counted (see the counting stream in runtime/middleware.ts).
 */
export const recordResponseBytes = (
  bytes: number,
  method: string,
  path: string,
  status: number,
) => {
  httpResponseBytes.record(bytes, {
    "http.method": method,
    "http.route": path,
    "http.response.status": `${status}`,
  });
};
/**
 * @returns a end function that when gets called observe the duration of the operation.
 */
export const startObserve = () => {
  const start = performance.now();
  return (method: string, path: string, status: number) => {
    httpDuration.record(Math.round(performance.now() - start), {
      "http.method": method,
      "http.route": path,
      "http.response.status": `${status}`,
    });
  };
};
