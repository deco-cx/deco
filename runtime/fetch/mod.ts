import { ENABLE_LOADER_CACHE } from "../caches/mod.ts";
import { createFetch as withCache } from "./fetchCache.ts";
import { createFetch as withLogs } from "./fetchLog.ts";

export const fetch = [
  withLogs,
  ENABLE_LOADER_CACHE ? undefined : withCache,
].filter(Boolean).reduceRight((acc, curr) => curr!(acc), globalThis.fetch);

export type { DecoRequestInit as RequestInit } from "./fetchCache.ts";
