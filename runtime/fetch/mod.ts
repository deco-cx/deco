import { DISABLE_LOADER_CACHE } from "../../blocks/loader.ts";
import { createFetch as withCache } from "./fetchCache.ts";
import { createFetch as withLogs } from "./fetchLog.ts";

export const fetch = [
  withLogs,
  DISABLE_LOADER_CACHE ? withCache : undefined,
].filter(Boolean).reduceRight((acc, curr) => curr!(acc), globalThis.fetch);

export type { DecoRequestInit as RequestInit } from "./fetchCache.ts";
