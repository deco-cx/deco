import { FetchInstrumentation, registerInstrumentations } from "../../deps.ts";

import {
  BatchSpanProcessor,
  NodeTracerProvider,
  OTLPTraceExporter,
  ParentBasedSampler,
  Resource,
  SemanticResourceAttributes,
  TraceIdRatioBasedSampler,
} from "../../deps.ts";

import {
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  opentelemetry,
} from "../../deps.ts";
import { context } from "../../live.ts";
import meta from "../../meta.json" assert { type: "json" };
import { DebugSampler } from "./samplers/debug.ts";
export const OTEL_IS_ENABLED = Deno.env.has("OTEL_EXPORTER_OTLP_ENDPOINT");

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
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

registerInstrumentations({
  instrumentations: [new FetchInstrumentation()],
});

// Monkeypatching to get past FetchInstrumentation's dependence on sdk-trace-web, which has runtime dependencies on some browser-only constructs. See https://github.com/open-telemetry/opentelemetry-js/issues/3413#issuecomment-1496834689 for more details
// Specifically for this line - https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-sdk-trace-web/src/utils.ts#L310
// @ts-ignore: monkey patching location
globalThis.location = {};

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

const OTEL_TRACING_RATIO_ENV_VAR = "OTEL_SAMPLING_RATIO";
const tracingSampleRatio = Deno.env.has(OTEL_TRACING_RATIO_ENV_VAR)
  ? +Deno.env.get(OTEL_TRACING_RATIO_ENV_VAR)!
  : 0;

const debugSampler = new DebugSampler();
const provider = new NodeTracerProvider({
  resource: resource,
  sampler: new ParentBasedSampler(
    {
      root: new TraceIdRatioBasedSampler(tracingSampleRatio),
      localParentSampled: debugSampler,
      localParentNotSampled: debugSampler,
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
