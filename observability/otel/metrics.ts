import { OTLPMetricExporter } from "npm:@opentelemetry/exporter-metrics-otlp-http";
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from "npm:@opentelemetry/sdk-metrics";
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

const meterProvider = new MeterProvider({
  resource,
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

export const decoMeter = meterProvider.getMeter("deco");
