import { ValueType } from "../deps.ts";
import { meter } from "./otel/metrics.ts";

const httpDuration = meter.createHistogram("http_request_duration", {
  description: "http request duration",
  unit: "ms",
  valueType: ValueType.DOUBLE,
});

/**
 * @returns a end function that when gets called observe the duration of the operation.
 */
export const startObserve = () => {
  const start = performance.now();
  return (method: string, path: string, status: number) => {
    httpDuration.record(performance.now() - start, {
      "http.method": method,
      "http.route": path,
      "http.response.status": `${status}`,
    });
  };
};
