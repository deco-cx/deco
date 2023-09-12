import { isWrappedError } from "../blocks/loader.ts";
import { shouldCollectMetrics } from "../observability/metrics.ts";
import { client } from "./client.ts";
import { defaultLabels, defaultLabelsValues } from "./labels.ts";

const opLabels = [
  "op",
  "is_error",
  ...defaultLabels,
];

type SystemInfoMemoryKey = keyof ReturnType<typeof Deno["systemMemoryInfo"]>;
const systemMemoryToBeCollected: Array<
  SystemInfoMemoryKey
> = [
  "available",
  "buffers",
  "cached",
  "free",
  "swapFree",
  "swapTotal",
  "total",
];

type MemoryInfoKey = keyof ReturnType<typeof Deno["memoryUsage"]>;

const memoryInfoToBeCollected: Array<
  MemoryInfoKey
> = [
  "external",
  "heapTotal",
  "heapUsed",
  "rss",
];

const systemMemoryGauges: Partial<Record<SystemInfoMemoryKey, client.Gauge>> =
  {};

for (const memKey of systemMemoryToBeCollected) {
  systemMemoryGauges[memKey] = new client.Gauge({
    name: `isolate_system_memory_${memKey}_usage`,
    help: `the isolate system memory ${memKey} usage`,
    labelNames: defaultLabels,
  });
}

const memoryGauges: Partial<Record<MemoryInfoKey, client.Gauge>> = {};

for (const memKey of memoryInfoToBeCollected) {
  memoryGauges[memKey] = new client.Gauge({
    name: `isolate_v8_memory_${memKey}_usage`,
    help: `the isolate v8 memory ${memKey} usage`,
    labelNames: defaultLabels,
  });
}

const operationDuration = new client.Histogram({
  name: "block_op_duration",
  help: "block operations duration",
  buckets: [100, 500, 1000, 5000],
  labelNames: opLabels,
});

/**
 * TODO (mcandeia) currently Deno deploy does not return valid values for this.
 * Collects the current memory usage.
 */
export const collectMemoryUsage = () => {
  const systemMemoryInfo = Deno
    .systemMemoryInfo();

  for (const memKey of systemMemoryToBeCollected) {
    systemMemoryGauges[memKey]?.set(
      defaultLabelsValues,
      systemMemoryInfo[memKey],
    );
  }
  const memoryUsage = Deno.memoryUsage();
  for (const memKey of memoryInfoToBeCollected) {
    memoryGauges[memKey]?.set(defaultLabelsValues, memoryUsage[memKey]);
  }
};

/**
 * @returns a end function that when gets called observe the duration of the operation.
 */
export const startMeasure = () => {
  const start = performance.now();
  return (op: string, err: unknown | null) => {
    observe(
      op,
      () =>
        new Promise<void>((resolve, reject) =>
          err === null ? resolve() : reject(err)
        ),
      start,
    );
  };
};
/**
 * Observe function durations based on the provided labels
 */
export const observe = async <T>(
  op: string,
  f: () => Promise<T>,
  optStart?: number,
): Promise<T> => {
  if (!shouldCollectMetrics) {
    return f();
  }
  const start = optStart ?? performance.now();
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
    operationDuration.labels({
      op,
      is_error: isError,
      ...defaultLabelsValues,
    }).observe(
      performance.now() - start,
    );
  }
};
