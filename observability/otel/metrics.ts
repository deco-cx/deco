import {
  ExplicitBucketHistogramAggregation,
  MeterProvider,
  OTLPMetricExporter,
  PeriodicExportingMetricReader,
  View,
} from "../../deps.ts";
import { OTEL_IS_ENABLED, resource } from "./config.ts";

export const OTEL_ENABLE_EXTRA_METRICS: boolean = Deno.env.has(
  "OTEL_ENABLE_EXTRA_METRICS",
);

// 2 minutes. We don't need frequent updates here.
export const OTEL_EXPORT_INTERVAL: number = parseInt(
  Deno.env.get("OTEL_EXPORT_INTERVAL") ?? "60000",
  10,
);

// a=b,c=d => {a:b, c:d}
const headersStringToObject = (headersString: string | undefined | null) => {
  if (!headersString) {
    return {};
  }
  const splitByComma = headersString.split(",").map((keyVal) =>
    keyVal.split("=") as [string, string]
  );
  return Object.fromEntries(splitByComma);
};

// Add views with different boundaries for each unit. Now that durations are
// recorded in seconds (OTel semconv), the `s` buckets must cover both
// sub-second HTTP latencies and multi-second gen_ai/block operations.
const msBoundaries = [10, 100, 500, 1000, 5000, 10000, 15000];
const sBoundaries = [
  0.005,
  0.01,
  0.025,
  0.05,
  0.1,
  0.25,
  0.5,
  1,
  2.5,
  5,
  10,
  30,
  60,
];

type IMeter = ReturnType<MeterProvider["getMeter"]>;
const meterProvider: MeterProvider = new MeterProvider({
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
      exportIntervalMillis: OTEL_EXPORT_INTERVAL,
    }),
  );
}

export const meter: IMeter = meterProvider.getMeter("deco");
