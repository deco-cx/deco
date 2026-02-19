// Lazy-loading metrics to avoid expensive module-level initialization

let _initialized = false;
let _meter: any = null;

export const OTEL_ENABLE_EXTRA_METRICS: boolean = Deno.env.has(
  "OTEL_ENABLE_EXTRA_METRICS",
);

export const OTEL_EXPORT_INTERVAL: number = parseInt(
  Deno.env.get("OTEL_EXPORT_INTERVAL") ?? "60000",
  10,
);

async function initializeMetrics() {
  if (_initialized) return;
  _initialized = true;

  const { OTEL_IS_ENABLED, resource } = await import("./config-lazy.ts");

  if (!OTEL_IS_ENABLED) {
    // Return no-op meter if OTEL is disabled
    _meter = {
      createHistogram: () => ({
        record: () => {},
      }),
      createCounter: () => ({
        add: () => {},
      }),
      createUpDownCounter: () => ({
        add: () => {},
      }),
      createObservableGauge: () => {},
      createObservableCounter: () => {},
      createObservableUpDownCounter: () => {},
    };
    return;
  }

  // Only load heavy OpenTelemetry modules if enabled
  const {
    ExplicitBucketHistogramAggregation,
    MeterProvider,
    OTLPMetricExporter,
    PeriodicExportingMetricReader,
    View,
  } = await import("../../deps.ts");

  const headersStringToObject = (headersString: string | undefined | null) => {
    if (!headersString) return {};
    const splitByComma = headersString.split(",").map((keyVal) =>
      keyVal.split("=") as [string, string]
    );
    return Object.fromEntries(splitByComma);
  };

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

  _meter = meterProvider.getMeter("deco");
}

// No-op meter for when not initialized
const noopMeter = {
  createHistogram: () => ({
    record: () => {},
  }),
  createCounter: () => ({
    add: () => {},
  }),
  createUpDownCounter: () => ({
    add: () => {},
  }),
  createObservableGauge: () => {},
  createObservableCounter: () => {},
  createObservableUpDownCounter: () => {},
};

// Proxy that initializes on first use
export const meter = new Proxy(noopMeter as any, {
  get(_target, prop) {
    if (!_initialized) {
      // Trigger initialization but return no-op for this call
      initializeMetrics().catch(console.error);
      return noopMeter[prop as keyof typeof noopMeter];
    }
    return _meter?.[prop] ?? noopMeter[prop as keyof typeof noopMeter];
  },
});
