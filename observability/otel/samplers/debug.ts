import {
  type Attributes,
  type Context,
  type Link,
  type Sampler,
  SamplingDecision,
  type SamplingResult,
  type SpanKind,
} from "../../../deps.ts";
import type { DecoState } from "../../../types.ts";
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

    // Only force sampling when explicitly requested:
    // 1. via x-trace-debug-id header (programmatic debug)
    // 2. via ?__d= query param or debug cookie (debugEnabled = true)
    // Normal requests always have a correlationId (UUID) — do NOT use it here,
    // otherwise every request would be forced to RECORD_AND_SAMPLED,
    // nullifying the defaultRatio in URLBasedSampler.
    const correlationId = req?.headers?.get?.("x-trace-debug-id") ??
      (state?.debugEnabled ? state?.correlationId : undefined);
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
