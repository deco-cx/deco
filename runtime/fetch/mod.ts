import { ENABLE_LOADER_CACHE } from "../caches/mod.ts";
import { createFetch as withCache } from "./fetchCache.ts";
import { createFetch as withLogs } from "./fetchLog.ts";

interface FechInfo {
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  (
    input: Request | URL | string,
    init?: RequestInit & {
      // @ts-ignore: deno namespace is not working
      client: Deno.HttpClient;
    },
  ): Promise<Response>;
}

export const fetch: FechInfo = [
  withLogs,
  ENABLE_LOADER_CACHE ? undefined : withCache,
].filter(Boolean).reduceRight((acc, curr) => curr!(acc), globalThis.fetch);

export type { DecoRequestInit as RequestInit } from "./fetchCache.ts";
