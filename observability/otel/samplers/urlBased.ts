import {
  Context,
  Sampler,
  SamplingDecision,
  SamplingResult,
} from "../../../deps.ts";
import { REQUEST_CONTEXT_KEY } from "../context.ts";

export interface URLBasedSampling {
  pattern: string; // supports only `*`
  ratio: number;
}

export interface SamplingOptions {
  defaultRatio?: number;
  byURLPattern?: URLBasedSampling[];
}

interface CompiledURLBasedSampling {
  ratio: number;
  matches(urlSegments: string[]): boolean;
}

export class URLBasedSampler implements Sampler {
  protected compiledOptions: CompiledURLBasedSampling[];
  constructor(protected options?: SamplingOptions) {
    this.compiledOptions = options?.byURLPattern?.map(({ pattern, ratio }) => {
      const patternSegments = pattern.split("/");
      return {
        ratio,
        matches(urlSegments: string[]) {
          if (urlSegments.length !== patternSegments.length) {
            return false;
          }
          return urlSegments.every((segment, segmentIdx) =>
            patternSegments[segmentIdx] === "*" ||
            patternSegments[segmentIdx] === segment
          );
        },
      };
    }) ?? [];
  }
  shouldSample(
    context: Context,
  ): SamplingResult {
    const req = context.getValue(REQUEST_CONTEXT_KEY) as Request;
    const pathnameSegments = req?.url
      ? new URL(req.url).pathname.split("/")
      : undefined;
    const defaultRatio = this.options?.defaultRatio ?? 0;
    const ratio = pathnameSegments
      ? this.compiledOptions.find((opt) => opt.matches(pathnameSegments))
        ?.ratio ??
        defaultRatio
      : defaultRatio;
    if (ratio > Math.random()) {
      return {
        decision: SamplingDecision.RECORD_AND_SAMPLED,
      };
    }
    return {
      decision: SamplingDecision.NOT_RECORD,
    };
  }
  toString(): string {
    return "URLBasedSampler";
  }
}
