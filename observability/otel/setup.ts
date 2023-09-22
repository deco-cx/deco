import { registerInstrumentations } from "npm:@opentelemetry/instrumentation";
import { FetchInstrumentation } from "npm:@opentelemetry/instrumentation-fetch";

import { OTLPTraceExporter } from "npm:@opentelemetry/exporter-trace-otlp-proto";
import { Resource } from "npm:@opentelemetry/resources";
import { BatchSpanProcessor } from "npm:@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "npm:@opentelemetry/sdk-trace-node";
import { SemanticResourceAttributes } from "npm:@opentelemetry/semantic-conventions";

import opentelemetry from "npm:@opentelemetry/api";
import { serve } from "std/http/server.ts";
import { context } from "../../live.ts";
import meta from "../../meta.json" assert { type: "json" };

// autoinstrumentation.ts

registerInstrumentations({
  instrumentations: [new FetchInstrumentation()],
});

// Monkeypatching to get past FetchInstrumentation's dependence on sdk-trace-web, which has runtime dependencies on some browser-only constructs. See https://github.com/open-telemetry/opentelemetry-js/issues/3413#issuecomment-1496834689 for more details
// Specifically for this line - https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-sdk-trace-web/src/utils.ts#L310
// @ts-ignore: monkey patching location
globalThis.location = {};

const resource = Resource.default().merge(
  new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: context.site,
    [SemanticResourceAttributes.SERVICE_VERSION]: context.deploymentId ??
      Deno.hostname(),
    "deco.runtime.version": meta.version,
  }),
);

const provider = new NodeTracerProvider({
  resource: resource,
});

const traceExporter = new OTLPTraceExporter();
provider.addSpanProcessor(new BatchSpanProcessor(traceExporter));

provider.register();

// Application code

export const tracer = opentelemetry.trace.getTracer(
  "deco-tracer",
);

const port = 8080;

const handler = async (request: Request): Promise<Response> => {
  // This call will be autoinstrumented
  await fetch("http://www.example.com/123");

  const span = tracer.startSpan(`constructBody`);
  const body = `Your user-agent is:\n\n${
    request.headers.get("user-agent") ?? "Unknown"
  }`;
  span.end();

  return new Response(body, { status: 200 });
};

await serve(instrument(handler), { port });

// Helper code

function instrument(handler) {
  async function instrumentedHandler(request) {
    let response;
    await tracer.startActiveSpan("handler", async (span) => {
      response = await handler(request);

      span.end();
    });

    return response;
  }

  return instrumentedHandler;
}
