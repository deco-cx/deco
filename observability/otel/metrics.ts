/**
 * OpenTelemetry Metrics
 *
 * This module provides a meter for recording metrics.
 * The actual MeterProvider is initialized lazily in config.ts to avoid
 * CommonJS compatibility issues with Vite SSR.
 */

import type { Meter } from "@opentelemetry/api";

export const OTEL_ENABLE_EXTRA_METRICS: boolean = Deno.env.has(
  "OTEL_ENABLE_EXTRA_METRICS",
);

export const OTEL_EXPORT_INTERVAL: number = parseInt(
  Deno.env.get("OTEL_EXPORT_INTERVAL") ?? "60000",
  10,
);

// No-op meter for when OpenTelemetry isn't initialized
const noopMeter: Meter = {
  createHistogram: () => ({ record: () => {} }) as never,
  createCounter: () => ({ add: () => {} }) as never,
  createUpDownCounter: () => ({ add: () => {} }) as never,
  createObservableGauge: () => ({ addCallback: () => {}, removeCallback: () => {} }) as never,
  createObservableCounter: () => ({ addCallback: () => {}, removeCallback: () => {} }) as never,
  createObservableUpDownCounter: () => ({ addCallback: () => {}, removeCallback: () => {} }) as never,
  createGauge: () => ({ record: () => {} }) as never,
};

/**
 * Get the meter instance. Returns a no-op meter if OpenTelemetry
 * hasn't been initialized (e.g., in Vite SSR mode).
 */
export const meter: Meter = new Proxy(noopMeter, {
  get(_target, prop) {
    const globalMeter = (globalThis as Record<string, unknown>).__deco_meter as Meter | undefined;
    if (globalMeter) {
      return (globalMeter as unknown as Record<string | symbol, unknown>)[prop];
    }
    return (noopMeter as unknown as Record<string | symbol, unknown>)[prop];
  },
});
