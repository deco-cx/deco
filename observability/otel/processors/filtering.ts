import { SpanStatusCode } from "../../../deps.ts";
import type {
  ReadableSpan,
  SpanProcessor,
} from "../../../deps.ts";
import type { Context } from "../../../deps.ts";
import type { SamplingOptions } from "../samplers/urlBased.ts";

// Span names that are framework internals with no actionable signal.
const ALWAYS_DROP_NAMES = new Set([
  "cache-match",
  "website/functions/requestToParam.ts",
  "website/handlers/router.ts",
  "website/handlers/fresh.ts",
  "website/pages/Page.tsx",
  "htmx/sections/htmx.tsx",
]);

const isRoot = (span: ReadableSpan): boolean => !span.parentSpanId;
const hasError = (span: ReadableSpan): boolean =>
  span.status.code === SpanStatusCode.ERROR;
const durationMs = (span: ReadableSpan): number =>
  span.duration[0] * 1000 + span.duration[1] / 1_000_000;
const isSlow = (span: ReadableSpan, thresholdMs: number): boolean =>
  durationMs(span) >= thresholdMs;

/**
 * Per-span filtering processor.
 *
 * Rules (in order, applied to every span individually):
 *   1. Error spans → always keep
 *   2. Root span + rate limit token available → keep
 *   3. Root span + no token → drop (prevents export explosion under traffic spikes)
 *   4. Known framework noise names → drop
 *   5. Slow spans (> slowThresholdMs) → keep
 *   6. Fast spans (< 5ms) → drop
 *   7. Everything else → keep
 *
 * Zero memory overhead — no buffering, O(1) per span.
 */
export class FilteringSpanProcessor implements SpanProcessor {
  private readonly slowThresholdMs: number;
  private readonly maxExportPerSecond: number;
  private tokens: number;
  private lastRefill: number = Date.now();

  constructor(
    private readonly inner: SpanProcessor,
    options: Pick<
      SamplingOptions,
      "slowThresholdMs" | "maxExportPerSecond"
    > = {},
  ) {
    this.slowThresholdMs = options.slowThresholdMs ?? 2000;
    this.maxExportPerSecond = options.maxExportPerSecond ?? Infinity;
    this.tokens = this.maxExportPerSecond;
  }

  // @ts-ignore: onStart signature varies across SDK versions
  onStart(span: ReadableSpan, ctx: Context): void {
    // @ts-ignore
    this.inner.onStart(span, ctx);
  }

  onEnd(span: ReadableSpan): void {
    if (this.shouldKeep(span)) {
      this.inner.onEnd(span);
    }
  }

  private shouldKeep(span: ReadableSpan): boolean {
    // Always keep error spans — critical signal regardless of anything else
    if (hasError(span)) return true;

    // Root spans: apply rate limiting for normal traffic
    if (isRoot(span)) {
      if (isFinite(this.maxExportPerSecond) && !this.consumeToken()) {
        return false;
      }
      return true;
    }

    // Child spans: filter noise
    if (ALWAYS_DROP_NAMES.has(span.name)) return false;
    if (isSlow(span, this.slowThresholdMs)) return true;
    if (durationMs(span) < 5) return false;
    return true;
  }

  private consumeToken(): boolean {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(
      this.maxExportPerSecond,
      this.tokens + elapsed * this.maxExportPerSecond,
    );
    this.lastRefill = now;
    if (this.tokens >= 1) {
      this.tokens--;
      return true;
    }
    return false;
  }

  shutdown(): Promise<void> {
    return this.inner.shutdown();
  }

  forceFlush(): Promise<void> {
    return this.inner.forceFlush();
  }
}
