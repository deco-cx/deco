import { isWrappedError } from "../blocks/loader.ts";
import { ValueType } from "../deps.ts";
import { meter, OTEL_ENABLE_EXTRA_METRICS } from "./otel/metrics.ts";

const observeWithMetrics = (() => {
  const operationDuration = meter.createHistogram("block_op_duration", {
    description: "operation duration",
    unit: "ms",
    valueType: ValueType.DOUBLE,
  });

  return async <T>(
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
})();

/**
 * When metrics are disabled, pass through directly to avoid async wrapper
 * overhead (performance.now, try/catch, isWrappedError check).
 */
export const observe: <T>(
  op: string,
  f: () => Promise<T>,
) => Promise<T> = OTEL_ENABLE_EXTRA_METRICS
  ? observeWithMetrics
  : (_op, f) => f();
