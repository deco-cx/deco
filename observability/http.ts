import { meter } from "./otel/metrics-lazy.ts";

// Lazy-create histogram on first use to avoid module-level initialization
let httpDuration: any = null;
function getHistogram() {
  if (!httpDuration) {
    httpDuration = meter.createHistogram("http_request_duration", {
      description: "http request duration",
      unit: "ms",
      valueType: 2, // ValueType.DOUBLE
    });
  }
  return httpDuration;
}

/**
 * @returns a end function that when gets called observe the duration of the operation.
 */
export const startObserve = () => {
  const start = performance.now();
  return (method: string, path: string, status: number) => {
    getHistogram().record(Math.round(performance.now() - start), {
      "http.method": method,
      "http.route": path,
      "http.response.status": `${status}`,
    });
  };
};
