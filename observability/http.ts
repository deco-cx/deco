import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_HTTP_ROUTE,
  METRIC_HTTP_SERVER_REQUEST_DURATION,
  ValueType,
} from "../deps.ts";
import { meter } from "./otel/metrics.ts";

// OTel semconv: name `http.server.request.duration`, unit seconds.
const httpDuration = meter.createHistogram(METRIC_HTTP_SERVER_REQUEST_DURATION, {
  description: "Duration of HTTP server requests.",
  unit: "s",
  valueType: ValueType.DOUBLE,
});
/**
 * @returns a end function that when gets called observe the duration of the operation.
 */
export const startObserve = () => {
  const start = performance.now();
  return (method: string, path: string, status: number) => {
    httpDuration.record((performance.now() - start) / 1000, {
      [ATTR_HTTP_REQUEST_METHOD]: method,
      [ATTR_HTTP_ROUTE]: path,
      [ATTR_HTTP_RESPONSE_STATUS_CODE]: status,
    });
  };
};
