import {
  ExplicitBucketHistogramAggregation,
  MeterProvider,
  OTLPMetricExporter,
  PeriodicExportingMetricReader,
  View,
} from "../../deps.ts";
import { OTEL_IS_ENABLED, resource } from "./config.ts";
// a=b,c=d => {a:b, c:d}
const headersStringToObject = (headersString: string | undefined | null) => {
  if (!headersString) {
    return {};
  }
  const splittedByComma = headersString.split(",").map((keyVal) =>
    keyVal.split("=") as [string, string]
  );
  return Object.fromEntries(splittedByComma);
};

// Add views with different boundaries for each unit.
const msBoundaries = [10, 100, 500, 1000, 5000, 10000, 15000];
const sBoundaries = [1, 5, 10, 50];

const meterProvider = new MeterProvider({
  resource,
  views: [
    new View({
      instrumentUnit: "ms",
      aggregation: new ExplicitBucketHistogramAggregation(msBoundaries),
    }),
    new View({
      instrumentUnit: "s",
      aggregation: new ExplicitBucketHistogramAggregation(sBoundaries),
    }),
  ],
});

if (OTEL_IS_ENABLED) {
  const metricExporter = new OTLPMetricExporter({
    url: Deno.env.get("OTEL_EXPORTER_OTLP_METRICS_ENDPOINT") ??
      `${Deno.env.get("OTEL_EXPORTER_OTLP_ENDPOINT")}/v1/metrics`,
    headers: headersStringToObject(Deno.env.get("OTEL_EXPORTER_OTLP_HEADERS")),
  });

  meterProvider.addMetricReader(
    new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 30_000,
    }),
  );
}

export const meter = meterProvider.getMeter("deco");
