import { getProbeThresholdAsNum, type LiveChecker } from "./handler.ts";

const HEALTHY_RATIO = Deno.env.get("PROBE_MEMORY_HEALTHY_RATIO");

const healthyRatio = HEALTHY_RATIO ? parseFloat(HEALTHY_RATIO) : 0.81;

const NAME = "MEMORY";
const MAX_MEM_THRESHOLD_MB = getProbeThresholdAsNum(NAME);

export const memoryChecker: LiveChecker = {
  name: NAME,
  checker: () => {
    const available = Deno.systemMemoryInfo().available / 1024;
    const usage = Deno.memoryUsage();
    const rssUsageMb = usage.rss / 1024;
    return rssUsageMb < (healthyRatio * (MAX_MEM_THRESHOLD_MB ?? available));
  },
};
