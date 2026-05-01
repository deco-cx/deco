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

// Add views with different boundaries for each unit.
const msBoundaries = [10, 100, 500, 1000, 5000, 10000, 15000];
const sBoundaries = [1, 5, 10, 50];

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

// Outgoing fetch metrics — disabled by default. Enable with OTEL_METRICS_OUTGOING_FETCH=true.
import { ValueType } from "../../deps.ts";
import { onFetch, parseUrlParts } from "../../utils/patched_fetch.ts";

if (Deno.env.get("OTEL_METRICS_OUTGOING_FETCH") === "true") {

const fetchCount = meter.createCounter("outgoing_fetch", {
  unit: "1",
  valueType: ValueType.INT,
});

const fetchDuration = meter.createHistogram("outgoing_fetch_duration", {
  unit: "ms",
  valueType: ValueType.DOUBLE,
});

onFetch((event) => {
  const { host } = parseUrlParts(event.url);
  const attrs = {
    app: event.app ?? "unknown",
    host: host ?? "unknown",
    method: event.method,
    status: event.status,
  };
  fetchCount.add(1, attrs);
  fetchDuration.record(event.durationMs, attrs);
});

} // OTEL_METRICS_OUTGOING_FETCH
