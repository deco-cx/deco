import { client } from "./client.ts";
import { defaultLabels, defaultLabelsValues } from "./labels.ts";

const httpLabels = [
  "method",
  "path",
  "status",
  ...defaultLabels,
];

const httpDuration = new client.Histogram({
  name: "http_request_duration",
  help: "http request duration",
  buckets: [100, 500, 1000, 5000],
  labelNames: httpLabels,
});

/**
 * @returns a end function that when gets called observe the duration of the operation.
 */
export const startObserve = () => {
  const start = performance.now();
  return (method: string, path: string, status: number) => {
    httpDuration.labels({
      method,
      path,
      status: `${status}`,
      ...defaultLabelsValues,
    }).observe(
      performance.now() - start,
    );
  };
};
