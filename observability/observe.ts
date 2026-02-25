import { isWrappedError } from "../blocks/loader.ts";
import { ValueType } from "../deps.ts";
import { meter, OTEL_ENABLE_EXTRA_METRICS } from "./otel/metrics.ts";

const operationDuration = meter.createHistogram("block_op_duration", {
  description: "operation duration",
  unit: "ms",
  valueType: ValueType.DOUBLE,
});

/**
 * Observe function durations based on the provided labels.
 * When OTEL_ENABLE_EXTRA_METRICS is disabled, bypasses the wrapper entirely
 * to avoid performance.now(), try/catch, and isWrappedError overhead.
 */
const _observe = async <T>(
  op: string,
  f: () => Promise<T>,
): Promise<T> => {
  const start = performance.now();
  let isError = "false";
  try {
    const result = await f();
    if (isWrappedError(result)) {
      isError = "true";
    }
    return result;
  } catch (error) {
    isError = "true";
    throw error;
  } finally {
    operationDuration.record(performance.now() - start, {
      "operation.name": op,
      "operation.is_error": isError,
    });
  }
};

// Short-circuit: when metrics are disabled, just call the function directly
export const observe: typeof _observe = OTEL_ENABLE_EXTRA_METRICS
  ? _observe
  : (_op, f) => f();
