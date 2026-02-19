import { isWrappedError } from "../blocks/loader.ts";
import { meter, OTEL_ENABLE_EXTRA_METRICS } from "./otel/metrics-lazy.ts";

// Lazy-create histogram to avoid module-level initialization
let operationDuration: any = null;
function getHistogram() {
  if (!operationDuration) {
    operationDuration = meter.createHistogram("block_op_duration", {
      description: "operation duration",
      unit: "ms",
      valueType: 2, // ValueType.DOUBLE
    });
  }
  return operationDuration;
}

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
      getHistogram().record(performance.now() - start, {
        "operation.name": op,
        "operation.is_error": isError,
      });
    }
  }
};
