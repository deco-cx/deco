import { getProbeThresholdAsNum, type LiveChecker } from "./handler.ts";

const MAX_MEMORY_MB = Deno.env.get("MAX_MEMORY_MB");

const NAME = "MEMORY_RATIO";
const MAX_MEM_RATIO = getProbeThresholdAsNum(NAME);
const MAX_MEMORY_MB_AS_INT = MAX_MEMORY_MB ? +MAX_MEMORY_MB : undefined;
export const memoryChecker: LiveChecker = {
  name: NAME,
  checker: () => {
    if (!MAX_MEMORY_MB_AS_INT || !MAX_MEM_RATIO) {
      return true;
    }
    const usage = Deno.memoryUsage();
    const rssUsageMb = usage.rss / 1024;
    return rssUsageMb < (MAX_MEMORY_MB_AS_INT * MAX_MEM_RATIO);
  },
};
