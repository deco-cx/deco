import * as log from "@std/log";
import { Logger } from "@std/log/logger";
import {
  BatchSpanProcessor,
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  FetchInstrumentation,
  NodeTracerProvider,
  opentelemetry,
  OTLPTraceExporter,
  ParentBasedSampler,
  registerInstrumentations,
} from "../../deps.ts";

if (Deno.env.has("OTEL_DIAG")) {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
}
import "./instrumentation/deno-runtime.ts";
import { DebugSampler } from "./samplers/debug.ts";
import { type SamplingOptions, URLBasedSampler } from "./samplers/urlBased.ts";
import { FilteringSpanProcessor } from "./processors/filtering.ts";
import { OTEL_IS_ENABLED, resource } from "./resource.ts";
import { OpenTelemetryHandler } from "./logger.ts";

const loggerName = "deco-logger";
export const logger: Logger = new Logger(loggerName, "INFO", {
  handlers: [
    ...OTEL_IS_ENABLED
      ? [
        new OpenTelemetryHandler("INFO", {
          resourceAttributes: resource.attributes,
          detectResources: false,
        }),
      ]
      : [new log.ConsoleHandler("INFO")],
  ],
});

const trackCfHeaders = [
  "Cf-Ray",
  "Cf-Cache-Status",
  "X-Origin-Cf-Cache-Status",
  "X-Vtex-Io-Cluster-Id",
  "X-Edge-Cache-Status",
];

registerInstrumentations({
  instrumentations: [
    // @ts-ignore: no idea why this is failing, but it should work
    new FetchInstrumentation(
      {
        ignoreUrls: [/127\.0\.0\.1/, /localhost/],
        applyCustomAttributesOnSpan: (
          span,
          _req,
          response,
        ) => {
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
      },
    ),
  ],
});

try {
  // Monkeypatching to get past FetchInstrumentation's dependence on sdk-trace-web, which has runtime dependencies on some browser-only constructs. See https://github.com/open-telemetry/opentelemetry-js/issues/3413#issuecomment-1496834689 for more details
  // Specifically for this line - https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-sdk-trace-web/src/utils.ts#L310
  // @ts-ignore: monkey patching location
  globalThis.location = {};
  // deno-lint-ignore no-empty
} catch {}
const parseSamplingOptions = (): SamplingOptions | undefined => {
  const encodedOpts = Deno.env.get("OTEL_SAMPLING_CONFIG");
  if (!encodedOpts) {
    return undefined;
  }
  try {
    return JSON.parse(atob(encodedOpts));
  } catch (err) {
    console.error("could not parse sampling config", err);
    return undefined;
  }
};

const samplingOptions = parseSamplingOptions();
const debugSampler = new DebugSampler(
  new URLBasedSampler(samplingOptions),
);
const provider = new NodeTracerProvider({
  resource: resource,
  sampler: new ParentBasedSampler(
    {
      root: debugSampler,
    },
  ),
});

// Deno 2.2+ has built-in OTel support via OTEL_DENO=true.
// If enabled, it sets its own global TracerProvider and instruments fetch/console,
// which would conflict with our manual setup (double spans, double logs).
// Skip provider.register() when Deno's native OTel is active.
const DENO_OTEL_ACTIVE = Deno.env.get("OTEL_DENO") === "true";


if (OTEL_IS_ENABLED && !DENO_OTEL_ACTIVE) {
  const traceExporter = new OTLPTraceExporter();
  provider.addSpanProcessor(
    new FilteringSpanProcessor(
      // @ts-ignore: no idea why this is failing, but it should work
      new BatchSpanProcessor(traceExporter),
      samplingOptions,
    ),
  );

  provider.register();

  addEventListener("unload", () => {
    provider.shutdown().catch(() => {});
  });
}

// Use provider.getTracer directly (not via global API) to ensure spans
// always go through our FilteringSpanProcessor, even if another TracerProvider
// overrides the global after our provider.register() call.
export const tracer = OTEL_IS_ENABLED && !DENO_OTEL_ACTIVE
  ? provider.getTracer("deco-tracer")
  : opentelemetry.trace.getTracer("deco-tracer");

export const tracerIsRecording = () =>
  opentelemetry.trace.getActiveSpan()?.isRecording() ?? false;
