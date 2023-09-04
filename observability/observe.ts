import { shouldCollectMetrics } from "deco/observability/metrics.ts";
import { context } from "../mod.ts";
import { client } from "./client.ts";
const defaultLabels = ["deploymentId", "site", "isError", "op"];

const operationDuration = new client.Histogram({
    name: "block_op_duration",
    help: "block operations duration",
    buckets: [1, 10, 100, 500, 1000, 5000],
    labelNames: defaultLabels,
});

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
            isError,
            deploymentId: context.deploymentId ?? Deno.hostname(),
            site: context.site,
        }).observe(
            performance.now() - start,
        );
    }
};
