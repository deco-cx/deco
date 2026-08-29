import { createFetch as withLogs } from "./fetchLog.ts";
import { createFetch as withTimeout } from "./fetchTimeout.ts";

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

/**
 * A modified fetch function that includes logging and caching features.
 *
 * Order matters: `withLogs` sits outermost so a call aborted by `withTimeout`
 * is still recorded, with the time it spent hanging, instead of disappearing
 * from `outgoing_fetch_duration`.
 *
 * @type {FechInfo}
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/fetch}
 */

export const fetch: FechInfo = [
  withLogs,
  withTimeout,
].filter(Boolean).reduceRight((acc, curr) => curr!(acc), globalThis.fetch);
