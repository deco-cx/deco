import { formatOutgoingFetch } from "../utils/log.ts";
import { context } from "../live.ts";

let logger: null | ((_: string) => void) = null;

export const setLogger = (loggerLike: typeof logger) => logger = loggerLike;

export const createFetch = (fetcher: typeof fetch): typeof fetch =>
  context.isDeploy ? fetcher : async function fetch(
    input: string | Request | URL,
    init?: RequestInit,
  ) {
    const start = performance.now();
    const response = await fetcher(input, init);

    logger?.(
      formatOutgoingFetch(
        new Request(input, init),
        response,
        performance.now() - start,
      ),
    );

    return response;
  };
