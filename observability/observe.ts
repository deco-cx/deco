import { ValueType } from "npm:@opentelemetry/api";
import { isWrappedError } from "../blocks/loader.ts";
import { decoMeter } from "./otel/metrics.ts";

const operationDuration = decoMeter.createHistogram("block_op_duration", {
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
    return await f().then((resp) => {
      if (isWrappedError(resp)) {
        isError = "true";
      }
      return resp;
    });
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
