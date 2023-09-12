import { isWrappedError } from "../blocks/loader.ts";
import meta from "../meta.json" assert { type: "json" };
import { context } from "../mod.ts";
import { shouldCollectMetrics } from "../observability/metrics.ts";
import { client } from "./client.ts";

const defaultLabels = [
  "deployment_id",
  "site",
  "deco_ver",
  "apps_ver",
];

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

const tryGetVersionOf = (pkg: string) => {
  try {
    const [_, ver] = import.meta.resolve(pkg).split("@");
    return ver.substring(0, ver.length - 1);
  } catch {
    return undefined;
  }
};
const apps_ver = tryGetVersionOf("apps/") ??
  tryGetVersionOf("deco-sites/std/") ?? "_";

/**
 * TODO (mcandeia) currently Deno deploy does not return valid values for this.
 * Collects the current memory usage.
 */
export const collectMemoryUsage = () => {
  const systemMemoryInfo = Deno
    .systemMemoryInfo();

  for (const memKey of systemMemoryToBeCollected) {
    systemMemoryGauges[memKey]?.set({
      deployment_id: context.deploymentId,
      site: context.site,
      deco_ver: meta.version,
      apps_ver,
    }, systemMemoryInfo[memKey]);
  }
  const memoryUsage = Deno.memoryUsage();
  for (const memKey of memoryInfoToBeCollected) {
    memoryGauges[memKey]?.set({
      deployment_id: context.deploymentId,
      site: context.site,
      deco_ver: meta.version,
      apps_ver,
    }, memoryUsage[memKey]);
  }
};
/**
 * Observe function durations based on the provided labels
 */
export const observe = async <T>(
  op: string,
  f: () => Promise<T>,
): Promise<T> => {
  if (!shouldCollectMetrics) {
    return f();
  }
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
    operationDuration.labels({
      op,
      is_error: isError,
      deployment_id: context.deploymentId ?? Deno.hostname(),
      site: context.site,
      deco_ver: meta.version,
      apps_ver,
    }).observe(
      performance.now() - start,
    );
  }
};