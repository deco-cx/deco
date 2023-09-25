import {
  Context,
  Sampler,
  SamplingDecision,
  SamplingResult,
} from "../../../deps.ts";
import { DecoState } from "../../../types.ts";
import { REQUEST_CONTEXT_KEY, STATE_CONTEXT_KEY } from "../context.ts";

export class DebugSampler implements Sampler {
  shouldSample(context: Context): SamplingResult {
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
    return {
      decision: SamplingDecision.RECORD,
    };
  }
  toString(): string {
    return "DebugSampler";
  }
}
