import { isWrappedError } from "../blocks/loader.ts";
import { ValueType } from "../deps.ts";
import { meter, OTEL_ENABLE_EXTRA_METRICS } from "./otel/metrics.ts";
import {
  ATTR_DECO_OPERATION_ERROR,
  ATTR_DECO_OPERATION_NAME,
  METRIC_DECO_BLOCK_OPERATION_DURATION,
} from "./otel/conventions.ts";

const operationDuration = meter.createHistogram(
  METRIC_DECO_BLOCK_OPERATION_DURATION,
  {
    description: "Duration of deco block operations.",
    unit: "s",
    valueType: ValueType.DOUBLE,
  },
);

/**
 * Observe function durations based on the provided labels
 */
export const observe = async <T>(
  op: string,
  f: () => Promise<T>,
): Promise<T> => {
  const start = performance.now();
  let isError = false;
  try {
    const result = await f();
    if (isWrappedError(result)) {
      isError = true;
    }
    return result;
  } catch (error) {
    isError = true;
    throw error;
  } finally {
    if (OTEL_ENABLE_EXTRA_METRICS) {
      operationDuration.record((performance.now() - start) / 1000, {
        [ATTR_DECO_OPERATION_NAME]: op,
        [ATTR_DECO_OPERATION_ERROR]: isError,
      });
    }
  }
};
