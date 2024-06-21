import { getProbeThresholdAsNum, type LiveChecker } from "./handler.ts";

const MAX_MEMORY_MB = Deno.env.get("MAX_MEMORY_MB");

const KB = 1024;
const MB = KB * 1024;
const NAME = "MAX_MEMORY_RATIO";
const MAX_MEM_RATIO = getProbeThresholdAsNum(NAME);
const MAX_MEMORY_MB_AS_INT = MAX_MEMORY_MB ? +MAX_MEMORY_MB : undefined;
export const memoryChecker: LiveChecker = {
  name: NAME,
  get: () => Deno.memoryUsage().rss / MB,
  print: (rss) => {
    return {
      ratio: MAX_MEM_RATIO,
      max: MAX_MEMORY_MB,
      usage: rss /
        (MAX_MEMORY_MB_AS_INT ?? (Deno.systemMemoryInfo().total / MB)),
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
