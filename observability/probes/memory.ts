import { env, isDeno } from "../../compat/mod.ts";
import { getProbeThresholdAsNum, type LiveChecker } from "./handler.ts";

const MAX_MEMORY_MB = env.get("MAX_MEMORY_MB");

const KB = 1024;
const MB = KB * 1024;
const NAME = "MAX_MEMORY_RATIO";
const MAX_MEM_RATIO = getProbeThresholdAsNum(NAME);
const MAX_MEMORY_MB_AS_INT = MAX_MEMORY_MB ? +MAX_MEMORY_MB : undefined;

// Cross-runtime memory usage
const getMemoryUsage = (): number => {
  if (isDeno) {
    // deno-lint-ignore no-explicit-any
    return (globalThis as any).Deno.memoryUsage().rss;
  }
  // Node.js/Bun
  return process.memoryUsage().rss;
};

// Cross-runtime system memory (total RAM)
const getSystemMemoryTotal = (): number => {
  if (isDeno) {
    // deno-lint-ignore no-explicit-any
    return (globalThis as any).Deno.systemMemoryInfo().total;
  }
  // Node.js/Bun
  try {
    const os = require("node:os");
    return os.totalmem();
  } catch {
    return 8 * 1024 * MB; // Fallback: assume 8GB
  }
};

export const memoryChecker: LiveChecker = {
  name: NAME,
  get: () => getMemoryUsage() / MB,
  print: (rss) => {
    return {
      ratio: MAX_MEM_RATIO,
      max: MAX_MEMORY_MB,
      usage: rss /
        (MAX_MEMORY_MB_AS_INT ?? (getSystemMemoryTotal() / MB)),
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
