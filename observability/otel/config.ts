/**
 * OpenTelemetry Configuration
 *
 * This module provides lazy-loaded OpenTelemetry components that are safe
 * for Vite SSR. All heavy OpenTelemetry packages are loaded dynamically
 * in init.ts to avoid CommonJS compatibility issues.
 */

import * as log from "@std/log";
import { Logger } from "@std/log/logger";
import type { Tracer } from "@opentelemetry/api";
import opentelemetry from "@opentelemetry/api";

// Detect if we're in Vite SSR mode
const isViteSSR = typeof (globalThis as Record<string, unknown>)
    .__vite_ssr_import__ === "function" ||
  typeof (globalThis as Record<string, unknown>).__vite_ssr_dynamic_import__ ===
    "function";

export const OTEL_IS_ENABLED: boolean = Deno.env.has(
  "OTEL_EXPORTER_OTLP_ENDPOINT",
) && !isViteSSR;

// Stub logger for Vite SSR mode and before initialization
const _stubLogger = new Logger("deco-logger", "INFO", {
  handlers: [new log.ConsoleHandler("INFO")],
});

// State - populated by initializeOtel()
let _logger: Logger = _stubLogger;
let _initialized = false;

/**
 * Get the current logger instance.
 * Returns a stub logger if OpenTelemetry hasn't been initialized.
 */
export const logger: Logger = new Proxy(_stubLogger, {
  get(_target, prop) {
    return (_logger as unknown as Record<string | symbol, unknown>)[prop];
  },
});

/**
 * Get the current tracer instance.
 */
export const tracer: Tracer = opentelemetry.trace.getTracer("deco-tracer");

export const tracerIsRecording = () =>
  opentelemetry.trace.getActiveSpan()?.isRecording() ?? false;

// Resource holder - populated by initializeOtel()
let _resource: unknown = null;
export const getResource = () => _resource;

/**
 * Initialize OpenTelemetry. This should only be called once, and only
 * when NOT in Vite SSR mode. Safe to call multiple times (idempotent).
 */
export async function initializeOtel(): Promise<void> {
  if (_initialized || isViteSSR) {
    return;
  }
  _initialized = true;

  try {
    // Dynamic imports to avoid loading CommonJS-dependent packages in Vite SSR
    const [
      resourcesModule,
      semanticModule,
      metricsModule,
      metricsExporterModule,
      traceNodeModule,
      traceBaseModule,
      traceExporterModule,
      fetchInstrModule,
      instrModule,
    ] = await Promise.all([
      import("@opentelemetry/resources"),
      import("@opentelemetry/semantic-conventions"),
      import("@opentelemetry/sdk-metrics"),
      import("@opentelemetry/exporter-metrics-otlp-http"),
      import("@opentelemetry/sdk-trace-node"),
      import("@opentelemetry/sdk-trace-base"),
      import("@opentelemetry/exporter-trace-otlp-proto"),
      import("@opentelemetry/instrumentation-fetch"),
      import("@opentelemetry/instrumentation"),
    ]);

    const { Resource } = resourcesModule;
    const { SemanticResourceAttributes } = semanticModule;
    const { MeterProvider, ExplicitBucketHistogramAggregation, View, PeriodicExportingMetricReader } = metricsModule;
    const { OTLPMetricExporter } = metricsExporterModule;
    const { NodeTracerProvider } = traceNodeModule;
    const { BatchSpanProcessor, ParentBasedSampler } = traceBaseModule;
    const { OTLPTraceExporter } = traceExporterModule;
    const { FetchInstrumentation } = fetchInstrModule;
    const { registerInstrumentations } = instrModule;

    const loggerImplModule = await import("./logger-impl.ts");
    const { DenoRuntimeInstrumentation } = await import("./instrumentation/deno-runtime.ts");
    const { DebugSampler } = await import("./samplers/debug.ts");
    const { URLBasedSampler } = await import("./samplers/urlBased.ts");

    // Import site context
    const { Context, context } = await import("../../deco.ts");
    const denoJSON = (await import("../../deno.json", { with: { type: "json" } })).default;
    const { ENV_SITE_NAME } = await import("../../engine/decofile/constants.ts");
    const { safeImportResolve } = await import("../../engine/importmap/builder.ts");

    const tryGetVersionOf = (pkg: string) => {
      try {
        const [_, ver] = safeImportResolve(pkg).split("@");
        return ver.substring(0, ver.length - 1);
      } catch {
        return undefined;
      }
    };
    const apps_ver = tryGetVersionOf("apps/") ??
      tryGetVersionOf("deco-sites/std/") ?? "_";

    // Create resource
    _resource = Resource.default().merge(
      new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: Deno.env.get(ENV_SITE_NAME) ?? "deco",
        [SemanticResourceAttributes.SERVICE_VERSION]: Context.active().deploymentId ?? Deno.hostname(),
        [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: crypto.randomUUID(),
        [SemanticResourceAttributes.CLOUD_PROVIDER]: context.platform,
        "deco.runtime.version": denoJSON.version,
        "deco.apps.version": apps_ver,
        [SemanticResourceAttributes.CLOUD_REGION]: Deno.env.get("DENO_REGION") ?? "unknown",
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: Deno.env.get("DECO_ENV_NAME")
          ? `env-${Deno.env.get("DECO_ENV_NAME")}`
          : "production",
      }),
    );

    // Initialize logger with OpenTelemetry handler
    if (OTEL_IS_ENABLED) {
      _logger = new Logger("deco-logger", "INFO", {
        handlers: [
          new loggerImplModule.OpenTelemetryHandler("INFO", {
            resourceAttributes: (_resource as InstanceType<typeof Resource>).attributes,
          }),
        ],
      });
    }

    // Initialize metrics
    const meterProvider = new MeterProvider({
      resource: _resource as InstanceType<typeof Resource>,
      views: [
        new View({
          instrumentUnit: "ms",
          aggregation: new ExplicitBucketHistogramAggregation([10, 100, 500, 1000, 5000, 10000, 15000]),
        }),
        new View({
          instrumentUnit: "s",
          aggregation: new ExplicitBucketHistogramAggregation([1, 5, 10, 50]),
        }),
      ],
    });

    const headersStringToObject = (headersString: string | undefined | null) => {
      if (!headersString) return {};
      return Object.fromEntries(headersString.split(",").map((kv) => kv.split("=") as [string, string]));
    };

    if (OTEL_IS_ENABLED) {
      const metricExporter = new OTLPMetricExporter({
        url: Deno.env.get("OTEL_EXPORTER_OTLP_METRICS_ENDPOINT") ??
          `${Deno.env.get("OTEL_EXPORTER_OTLP_ENDPOINT")}/v1/metrics`,
        headers: headersStringToObject(Deno.env.get("OTEL_EXPORTER_OTLP_HEADERS")),
      });
      meterProvider.addMetricReader(
        new PeriodicExportingMetricReader({
          exporter: metricExporter,
          exportIntervalMillis: parseInt(Deno.env.get("OTEL_EXPORT_INTERVAL") ?? "60000", 10),
        }),
      );
    }

    // Store meter for metrics.ts to use
    (globalThis as Record<string, unknown>).__deco_meter = meterProvider.getMeter("deco");

    // Initialize tracing with instrumentation
    registerInstrumentations({
      instrumentations: [
        // @ts-ignore: type mismatch but works
        new FetchInstrumentation({
          applyCustomAttributesOnSpan: (span, _req, response) => {
            if (span && response instanceof Response) {
              ["Cf-Ray", "Cf-Cache-Status", "X-Origin-Cf-Cache-Status", "X-Vtex-Io-Cluster-Id", "X-Edge-Cache-Status"]
                .forEach((header) => {
                  const val = response.headers.get(header);
                  if (val) span.setAttribute(`http.response.header.${header.toLocaleLowerCase()}`, val);
                });
            }
          },
        }),
        new DenoRuntimeInstrumentation(),
      ],
    });

    try {
      // @ts-ignore: monkey patching for FetchInstrumentation
      globalThis.location = {};
    } catch { /* ignore */ }

    const parseSamplingOptions = () => {
      const encodedOpts = Deno.env.get("OTEL_SAMPLING_CONFIG");
      if (!encodedOpts) return undefined;
      try {
        return JSON.parse(atob(encodedOpts));
      } catch (err) {
        console.error("could not parse sampling config", err);
        return undefined;
      }
    };

    const provider = new NodeTracerProvider({
      resource: _resource as InstanceType<typeof Resource>,
      sampler: new ParentBasedSampler({ root: new DebugSampler(new URLBasedSampler(parseSamplingOptions())) }),
    });

    if (OTEL_IS_ENABLED) {
      // @ts-ignore: type mismatch but works
      provider.addSpanProcessor(new BatchSpanProcessor(new OTLPTraceExporter()));
      provider.register();
    }

  } catch (err) {
    console.warn("Failed to initialize OpenTelemetry:", err);
  }
}

// Auto-initialize if OTEL is enabled and not in Vite SSR
if (OTEL_IS_ENABLED) {
  initializeOtel();
}
