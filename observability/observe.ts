import { shouldCollectMetrics } from "../observability/metrics.ts";
import { isWrappedError } from "../blocks/loader.ts";
import meta from "../meta.json" assert { type: "json" };
import { context } from "../mod.ts";
import { client } from "./client.ts";

const defaultLabels = [
  "op",
  "is_error",
  "deployment_id",
  "site",
  "deco_ver",
  "apps_ver",
  "fresh_ver",
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
      fresh_ver,
    }).observe(
      performance.now() - start,
    );
  }
};
