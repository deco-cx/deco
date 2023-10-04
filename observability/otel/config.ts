import * as log from "https://deno.land/std@0.203.0/log/mod.ts";
import {
  BatchSpanProcessor,
  FetchInstrumentation,
  NodeTracerProvider,
  opentelemetry,
  OTLPTraceExporter,
  ParentBasedSampler,
  registerInstrumentations,
  Resource,
  SemanticResourceAttributes,
} from "../../deps.ts";
import { context } from "../../live.ts";
import meta from "../../meta.json" assert { type: "json" };
import { DenoRuntimeInstrumentation } from "./instrumentation/deno-runtime.ts";
import { DebugSampler } from "./samplers/debug.ts";
import { SamplingOptions, URLBasedSampler } from "./samplers/urlBased.ts";

import { OpenTelemetryHandler } from "https://denopkg.com/hyperdxio/hyperdx-js@65783e6cd18321461129d82613628dcabfe5f846/packages/deno/logger.ts";

const tryGetVersionOf = (pkg: string) => {
  try {
    const [_, ver] = import.meta.resolve(pkg).split("@");
    return ver.substring(0, ver.length - 1);
  } catch {
    return undefined;
  }
};
const apps_ver = tryGetVersionOf("apps/") ??
  tryGetVersionOf("deco-sites/std/") ?? "_";

export const resource = Resource.default().merge(
  new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: Deno.env.get("DECO_SITE_NAME") ??
      "deco",
    [SemanticResourceAttributes.SERVICE_VERSION]: context.deploymentId ??
      Deno.hostname(),
    "deco.runtime.version": meta.version,
    "deco.apps.version": apps_ver,
  }),
);

const loggerName = "deco-logger";
log.setup({
  handlers: {
    otel: new OpenTelemetryHandler("ERROR", {
      resourceAttributes: resource.attributes,
    }),
  },

  loggers: {
    [loggerName]: {
      level: "ERROR",
      handlers: ["otel"],
    },
  },
});

export const logger = log.getLogger(loggerName);
export const OTEL_IS_ENABLED = Deno.env.has("OTEL_EXPORTER_OTLP_ENDPOINT");

registerInstrumentations({
  instrumentations: [
    new FetchInstrumentation(),
    new DenoRuntimeInstrumentation(),
  ],
});

// Monkeypatching to get past FetchInstrumentation's dependence on sdk-trace-web, which has runtime dependencies on some browser-only constructs. See https://github.com/open-telemetry/opentelemetry-js/issues/3413#issuecomment-1496834689 for more details
// Specifically for this line - https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-sdk-trace-web/src/utils.ts#L310
// @ts-ignore: monkey patching location
globalThis.location = {};

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
  provider.addSpanProcessor(new BatchSpanProcessor(traceExporter));

  provider.register();
}

export const tracer = opentelemetry.trace.getTracer(
  "deco-tracer",
);
