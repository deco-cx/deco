import { shouldCollectMetrics } from "deco/observability/metrics.ts";
import meta from "../meta.json" assert { type: "json" };
import { context } from "../mod.ts";
import { client } from "./client.ts";

const defaultLabels = [
  "deployment_id",
  "site",
  "is_error",
  "op",
  "deco_ver",
  "apps_ver",
];

const operationDuration = new client.Histogram({
  name: "block_op_duration",
  help: "block operations duration",
  buckets: [1, 10, 100, 500, 1000, 5000],
  labelNames: defaultLabels,
});

const tryGetVersionOf = (pkg: string) => {
  try {
    const [_, ver] = import.meta.resolve(pkg).split("@");
    return `${pkg}@${ver.substring(0, ver.length - 1)}`;
  } catch {
    return undefined;
  }
};
const apps_ver = tryGetVersionOf("apps/") ??
  tryGetVersionOf("deco-sites/std/") ?? "_";
const fresh_ver = tryGetVersionOf("$fresh/") ?? "_";
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
    return await f();
  } catch (error) {
    isError = "true";
    throw error;
  } finally {
    operationDuration.labels({
      op,
      is_error: isError,
      deployment_id: context.deploymentId ?? Deno.hostname(),
      deco_ver: meta.version,
      apps_ver,
      fresh_ver,
      site: context.site,
    }).observe(
      performance.now() - start,
    );
  }
};
