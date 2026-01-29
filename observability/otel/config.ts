import * as log from "@std/log";
import { Logger } from "@std/log/logger";
import { Context, context } from "../../deco.ts";
import denoJSON from "../../deno.json" with { type: "json" };
import {
  opentelemetry,
  Resource,
  SemanticResourceAttributes,
} from "../../deps.ts";

import { ENV_SITE_NAME } from "../../engine/decofile/constants.ts";
import { safeImportResolve } from "../../engine/importmap/builder.ts";
import { OpenTelemetryHandler } from "./logger.ts";

// Detect if we're in Vite SSR mode - these globals are set by Vite
const isViteSSR = typeof (globalThis as Record<string, unknown>)
    .__vite_ssr_import__ === "function" ||
  typeof (globalThis as Record<string, unknown>).__vite_ssr_dynamic_import__ ===
    "function";

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

export const resource = Resource.default().merge(
  new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: Deno.env.get(ENV_SITE_NAME) ??
      "deco",
    [SemanticResourceAttributes.SERVICE_VERSION]:
      Context.active().deploymentId ??
        Deno.hostname(),
    [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: crypto.randomUUID(),
    [SemanticResourceAttributes.CLOUD_PROVIDER]: context.platform,
    "deco.runtime.version": denoJSON.version,
    "deco.apps.version": apps_ver,
    [SemanticResourceAttributes.CLOUD_REGION]: Deno.env.get("DENO_REGION") ??
      "unknown",
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: Deno.env.get(
        "DECO_ENV_NAME",
      )
      ? `env-${Deno.env.get("DECO_ENV_NAME")}`
      : "production",
  }),
);

const loggerName = "deco-logger";
export const OTEL_IS_ENABLED: boolean = Deno.env.has(
  "OTEL_EXPORTER_OTLP_ENDPOINT",
) && !isViteSSR;

export const logger: Logger = new Logger(loggerName, "INFO", {
  handlers: [
    ...OTEL_IS_ENABLED
      ? [
        new OpenTelemetryHandler("INFO", {
          resourceAttributes: resource.attributes,
        }),
      ]
      : [new log.ConsoleHandler("INFO")],
  ],
});

// Initialize OpenTelemetry instrumentation lazily to avoid CommonJS issues in Vite SSR
// The packages @opentelemetry/instrumentation-fetch, @opentelemetry/instrumentation,
// and @opentelemetry/sdk-trace-node use require-in-the-middle which is CommonJS-only
let _initialized = false;
async function initializeOtel() {
  if (_initialized || isViteSSR) return;
  _initialized = true;

  try {
    // Dynamic imports to avoid loading CommonJS-dependent packages in Vite SSR
    const [
      { FetchInstrumentation },
      { registerInstrumentations },
      { NodeTracerProvider },
      { BatchSpanProcessor, ParentBasedSampler },
      { OTLPTraceExporter },
    ] = await Promise.all([
      import("@opentelemetry/instrumentation-fetch"),
      import("@opentelemetry/instrumentation"),
      import("@opentelemetry/sdk-trace-node"),
      import("@opentelemetry/sdk-trace-base"),
      import("@opentelemetry/exporter-trace-otlp-proto"),
    ]);

    const { DenoRuntimeInstrumentation } = await import(
      "./instrumentation/deno-runtime.ts"
    );
    const { DebugSampler } = await import("./samplers/debug.ts");
    const { URLBasedSampler } = await import("./samplers/urlBased.ts");

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
        new DenoRuntimeInstrumentation(),
      ],
    });

    try {
      // Monkeypatching to get past FetchInstrumentation's dependence on sdk-trace-web
      // See https://github.com/open-telemetry/opentelemetry-js/issues/3413#issuecomment-1496834689
      // @ts-ignore: monkey patching location
      globalThis.location = {};
      // deno-lint-ignore no-empty
    } catch {}

    const parseSamplingOptions = () => {
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

    const debugSampler = new DebugSampler(
      new URLBasedSampler(parseSamplingOptions()),
    );
    const provider = new NodeTracerProvider({
      resource: resource,
      sampler: new ParentBasedSampler(
        {
          root: debugSampler,
        },
      ),
    });

    if (OTEL_IS_ENABLED) {
      const traceExporter = new OTLPTraceExporter();
      // @ts-ignore: no idea why this is failing, but it should work
      provider.addSpanProcessor(new BatchSpanProcessor(traceExporter));

      provider.register();
    }
  } catch (err) {
    console.warn("Failed to initialize OpenTelemetry instrumentation:", err);
  }
}

// Initialize immediately if OTEL is enabled and not in Vite SSR
if (OTEL_IS_ENABLED) {
  initializeOtel();
}

export const tracer = opentelemetry.trace.getTracer(
  "deco-tracer",
);

export const tracerIsRecording = () =>
  opentelemetry.trace.getActiveSpan()?.isRecording() ?? false;
