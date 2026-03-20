import {
  type Context,
  type Sampler,
  SamplingDecision,
  type SamplingResult,
} from "../../../deps.ts";
import { REQUEST_CONTEXT_KEY } from "../context.ts";

export interface URLBasedSampling {
  pattern: string; // supports only `*`
  ratio: number;
}

export interface SamplingOptions {
  defaultRatio?: number;
  byURLPattern?: URLBasedSampling[];
  // Tail sampling options — applied after the trace completes
  alwaysExportErrors?: boolean; // default: true
  slowThresholdMs?: number; // always export traces slower than this (default: 2000)
  exportRatio?: number; // fraction of non-error/non-slow traces to export (default: 1)
  maxExportPerSecond?: number; // hard cap on normal traces/s — errors/slow bypass this
}

interface CompiledURLBasedSampling {
  ratio: number;
  matches(urlSegments: string[]): boolean;
}

// Paths that are always excluded regardless of sampling config.
// These are noise: assets, health checks, and framework internals.
const ALWAYS_EXCLUDE = [
  /^\/_frsh\//,
  /^\/deco\/_liveness$/,
  /^\/favicon\./,
  /\.(js|css|map|woff2?|ttf|eot|ico|png|jpg|jpeg|svg|webp|gif)$/,
];

const isExcluded = (pathname: string): boolean =>
  ALWAYS_EXCLUDE.some((re) => re.test(pathname));

// Bot detection — zero spans for bot traffic.
// Bots pollute cache with unique keys and inflate trace volume without signal.
const isBot = (req: Request): boolean => {
  // Cloudflare verified bot header — most reliable
  if (req.headers.get("cf-verified-bot") === "true") return true;
  const ua = req.headers.get("user-agent") ?? "";
  if (!ua) return false;
  // Known monitoring robots and crawlers
  return /bot|crawl|spider|slurp|monitoring|uptimerobot|pingdom|datadog|newrelic|googlebot|bingbot|yandex/i
    .test(ua);
};

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
    const url = req?.url ? new URL(req.url) : undefined;

    if (url && isExcluded(url.pathname)) {
      return { decision: SamplingDecision.NOT_RECORD };
    }

    if (req && isBot(req)) {
      return { decision: SamplingDecision.NOT_RECORD };
    }

    const pathnameSegments = url?.pathname.split("/");
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
