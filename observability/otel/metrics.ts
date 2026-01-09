import { env } from "../../compat/mod.ts";
import type {
  MeterProvider as MeterProviderType,
} from "../../deps.ts";

// Lazy import to avoid circular dependency issues with Bun
let _deps: typeof import("../../deps.ts") | null = null;
const getDeps = async () => {
  if (!_deps) {
    _deps = await import("../../deps.ts");
  }
  return _deps;
};

export const OTEL_ENABLE_EXTRA_METRICS: boolean = env.has(
  "OTEL_ENABLE_EXTRA_METRICS",
);

// 2 minutes. We don't need frequent updates here.
export const OTEL_EXPORT_INTERVAL: number = parseInt(
  env.get("OTEL_EXPORT_INTERVAL") ?? "60000",
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

type IMeter = ReturnType<MeterProviderType["getMeter"]>;

// Lazy meter initialization
let _meterProvider: MeterProviderType | null = null;
let _meter: IMeter | null = null;

const initMeter = async (): Promise<IMeter> => {
  if (_meter) return _meter;

  const deps = await getDeps();
  const { OTEL_IS_ENABLED, resource } = await import("./config.ts");
  const {
    ExplicitBucketHistogramAggregation,
    MeterProvider,
    OTLPMetricExporter,
    PeriodicExportingMetricReader,
    View,
  } = deps;

  _meterProvider = new MeterProvider({
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
      url: env.get("OTEL_EXPORTER_OTLP_METRICS_ENDPOINT") ??
        `${env.get("OTEL_EXPORTER_OTLP_ENDPOINT")}/v1/metrics`,
      headers: headersStringToObject(env.get("OTEL_EXPORTER_OTLP_HEADERS")),
    });

    _meterProvider.addMetricReader(
      new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: OTEL_EXPORT_INTERVAL,
      }),
    );
  }

  _meter = _meterProvider.getMeter("deco");
  return _meter;
};

// Sync getter that returns a no-op meter if not yet initialized
const createNoOpMeter = (): IMeter => {
  const noOp = () => {};
  return {
    createCounter: () => ({ add: noOp }),
    createUpDownCounter: () => ({ add: noOp }),
    createHistogram: () => ({ record: noOp }),
    createObservableGauge: () => ({ addCallback: noOp }),
    createObservableCounter: () => ({ addCallback: noOp }),
    createObservableUpDownCounter: () => ({ addCallback: noOp }),
  } as unknown as IMeter;
};

// Initialize eagerly in background
initMeter().catch(() => {});

// Export a proxy that lazy-loads the real meter
export const meter: IMeter = new Proxy(createNoOpMeter(), {
  get(target, prop) {
    if (_meter) {
      return Reflect.get(_meter, prop);
    }
    return Reflect.get(target, prop);
  },
});

export { initMeter };
