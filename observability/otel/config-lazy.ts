// Lazy-loading OpenTelemetry configuration
// Only imports heavy OpenTelemetry modules if OTEL_EXPORTER_OTLP_ENDPOINT is set

import * as log from "@std/log";
import { Logger } from "@std/log/logger";

// Check if OTEL is enabled BEFORE importing anything heavy
export const OTEL_IS_ENABLED: boolean = Deno.env.has(
  "OTEL_EXPORTER_OTLP_ENDPOINT",
);

// Lightweight logger that works without OpenTelemetry
const loggerName = "deco-logger";
export const logger: Logger = new Logger(loggerName, "INFO", {
  handlers: [new log.ConsoleHandler("INFO")],
});

// Lazy-loaded OpenTelemetry components
let _otelInitialized = false;
let _tracer: any = null;
let _resource: any = null;

async function initializeOTel() {
  if (_otelInitialized || !OTEL_IS_ENABLED) return;
  _otelInitialized = true;

  // Only NOW import the heavy OpenTelemetry modules
  const { Context, context } = await import("../../deco.ts");
  const denoJSON = await import("../../deno.json", { with: { type: "json" } });
  const {
    BatchSpanProcessor,
    FetchInstrumentation,
    NodeTracerProvider,
    opentelemetry,
    OTLPTraceExporter,
    ParentBasedSampler,
    registerInstrumentations,
    Resource,
    SemanticResourceAttributes,
  } = await import("../../deps.ts");
  const { DenoRuntimeInstrumentation } = await import(
    "./instrumentation/deno-runtime.ts"
  );
  const { DebugSampler } = await import("./samplers/debug.ts");
  const { URLBasedSampler } = await import("./samplers/urlBased.ts");
  const { ENV_SITE_NAME } = await import("../../engine/decofile/constants.ts");
  const { safeImportResolve } = await import(
    "../../engine/importmap/builder.ts"
  );
  const { OpenTelemetryHandler } = await import("./logger.ts");

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

  _resource = Resource.default().merge(
    new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]:
        Deno.env.get(ENV_SITE_NAME) ?? "deco",
      [SemanticResourceAttributes.SERVICE_VERSION]:
        Context.active().deploymentId ?? Deno.hostname(),
      [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: crypto.randomUUID(),
      [SemanticResourceAttributes.CLOUD_PROVIDER]: context.platform,
      "deco.runtime.version": denoJSON.default.version,
      "deco.apps.version": apps_ver,
      [SemanticResourceAttributes.CLOUD_REGION]:
        Deno.env.get("DENO_REGION") ?? "unknown",
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: Deno.env.get(
        "DECO_ENV_NAME",
      )
        ? `env-${Deno.env.get("DECO_ENV_NAME")}`
        : "production",
    }),
  );

  // Update logger to use OpenTelemetry handler
  logger.handlers = [
    new OpenTelemetryHandler("INFO", {
      resourceAttributes: _resource.attributes,
    }),
  ];

  const trackCfHeaders = [
    "Cf-Ray",
    "Cf-Cache-Status",
    "X-Origin-Cf-Cache-Status",
    "X-Vtex-Io-Cluster-Id",
    "X-Edge-Cache-Status",
  ];

  registerInstrumentations({
    instrumentations: [
      new FetchInstrumentation({
        applyCustomAttributesOnSpan: (span, _req, response) => {
          if (span && response instanceof Response) {
            trackCfHeaders.forEach((header) => {
              const val = response.headers.get(header);
              if (val) {
                span.setAttribute(
                  `http.response.header.${header.toLocaleLowerCase()}`,
                  val,
                );
              }
            });
          }
        },
      }),
      new DenoRuntimeInstrumentation(),
    ],
  });

  try {
    // @ts-ignore: monkey patching
    globalThis.location = {};
  } catch {}

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

  const debugSampler = new DebugSampler(
    new URLBasedSampler(parseSamplingOptions()),
  );
  const provider = new NodeTracerProvider({
    resource: _resource,
    sampler: new ParentBasedSampler({
      root: debugSampler,
    }),
  });

  const traceExporter = new OTLPTraceExporter();
  provider.addSpanProcessor(new BatchSpanProcessor(traceExporter));
  provider.register();

  _tracer = opentelemetry.trace.getTracer("deco-tracer");
}

// No-op tracer for when OTEL is disabled
const noopTracer = {
  startSpan: () => ({
    end: () => {},
    setAttribute: () => {},
    setStatus: () => {},
    recordException: () => {},
    updateName: () => {},
    setAttributes: () => {},
  }),
  startActiveSpan: (
    _name: string,
    _options: any,
    _context: any,
    fn: (span: any) => any,
  ) => {
    return fn(noopTracer.startSpan());
  },
};

// Export tracer that initializes on first use
export const tracer = new Proxy(noopTracer as any, {
  get(target, prop) {
    if (!OTEL_IS_ENABLED) {
      return target[prop];
    }
    if (!_otelInitialized) {
      // Trigger initialization but return no-op for this call
      initializeOTel().catch(console.error);
      return target[prop];
    }
    return _tracer?.[prop] ?? target[prop];
  },
});

// Export resource (lazy-loaded)
export const resource = new Proxy({} as any, {
  get(_target, prop) {
    if (!OTEL_IS_ENABLED || !_otelInitialized) {
      return undefined;
    }
    return _resource?.[prop];
  },
});

// Explicit initialization function
export async function ensureOTelInitialized() {
  await initializeOTel();
}
