import { isWrappedError } from "../blocks/loader.ts";
import { ValueType } from "../deps.ts";
import { meter, OTEL_ENABLE_EXTRA_METRICS } from "./otel/metrics.ts";

const operationDuration = meter.createHistogram("block_op_duration", {
  description: "operation duration",
  unit: "ms",
  valueType: ValueType.DOUBLE,
});

/**
 * Observe function durations based on the provided labels
 */
export const observe = async <T>(
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
    if (OTEL_ENABLE_EXTRA_METRICS) {
      operationDuration.record(performance.now() - start, {
        "operation.name": op,
        "operation.is_error": isError,
      });
    }
  }
};
