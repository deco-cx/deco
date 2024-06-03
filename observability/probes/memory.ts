import { getProbeThresholdAsNum, type LiveChecker } from "./handler.ts";

const healthyRatio = 0.95;
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
