import {
  Attributes,
  Context,
  Link,
  Sampler,
  SamplingDecision,
  SamplingResult,
  SpanKind,
} from "../../../deps.ts";
import { DecoState } from "../../../types.ts";
import { REQUEST_CONTEXT_KEY, STATE_CONTEXT_KEY } from "../context.ts";

export class DebugSampler implements Sampler {
  constructor(protected inner?: Sampler) {}
  shouldSample(
    context: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: Attributes,
    links: Link[],
  ): SamplingResult {
    const req = context.getValue(REQUEST_CONTEXT_KEY) as Request;
    const state = context.getValue(STATE_CONTEXT_KEY) as DecoState;

    const correlationId = req?.headers?.get?.("x-trace-debug-id") ??
      state?.correlationId;
    if (correlationId) {
      return {
        decision: SamplingDecision.RECORD_AND_SAMPLED,
        attributes: {
          "trace.debug.id": correlationId,
        },
      };
    }
    if (this.inner) {
      return this.inner.shouldSample(
        context,
        traceId,
        spanName,
        spanKind,
        attributes,
        links,
      );
    }
    return {
      decision: SamplingDecision.NOT_RECORD,
    };
  }
  toString(): string {
    return "DebugSampler";
  }
}
