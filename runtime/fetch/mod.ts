import { ENABLE_LOADER_CACHE } from "../caches/mod.ts";
import { createFetch as withCache } from "./fetchCache.ts";
import { createFetch as withLogs } from "./fetchLog.ts";

// Getting this error: error: TS2694 [ERROR]: Namespace 'Deno' has no exported member 'HttpClient'.
// client: Deno.HttpClient;

// interface ReturnFetch {
//   (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
//   (
//     input: Request | URL | string,
//     init?: RequestInit & {
//       client: Deno.HttpClient;
//     },
//   ): Promise<Response>;
// }

export const fetch = [
  withLogs,
  ENABLE_LOADER_CACHE ? undefined : withCache,
].filter(Boolean).reduceRight((acc, curr) => curr!(acc), globalThis.fetch);

export type { DecoRequestInit as RequestInit } from "./fetchCache.ts";
