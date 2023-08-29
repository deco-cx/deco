import { createFetch as withCache } from "./fetchCache.ts";
import { createFetch as withLogs } from "./fetchLog.ts";

export const fetch = [
  withLogs,
  withCache,
].reduceRight((acc, curr) => curr(acc), globalThis.fetch);
