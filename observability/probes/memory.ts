import { getProbeThresholdAsNum, type LiveChecker } from "./handler.ts";

const MAX_MEMORY_MB = Deno.env.get("MAX_MEMORY_MB");

const NAME = "MEMORY_RATIO";
const MAX_MEM_RATIO = getProbeThresholdAsNum(NAME);
const MAX_MEMORY_MB_AS_INT = MAX_MEMORY_MB ? +MAX_MEMORY_MB : undefined;
export const memoryChecker: LiveChecker = {
  name: NAME,
  observed: () => Deno.memoryUsage().rss / 1024,
  beautify: (rss) => {
    return {
      ratio: MAX_MEM_RATIO,
      max: MAX_MEMORY_MB,
      usage: rss / (Deno.systemMemoryInfo().total / 1024),
      rss,
    };
  },
  check: (rss) => {
    if (!MAX_MEMORY_MB_AS_INT || !MAX_MEM_RATIO) {
      return true;
    }
    return rss < (MAX_MEMORY_MB_AS_INT * MAX_MEM_RATIO);
  },
};
