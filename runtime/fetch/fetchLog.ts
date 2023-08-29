import { formatOutgoingFetch } from "../../utils/log.ts";

let logger: null | ((_: string) => void) = null;

export const setLogger = (loggerLike: typeof logger) => logger = loggerLike;

export const createFetch = (fetcher: typeof fetch): typeof fetch =>
  async function fetch(
    input: string | Request | URL,
    init?: RequestInit,
  ) {
    const start = logger && performance.now();
    const response = await fetcher(input, init);

    if (logger && start) {
      logger(
        formatOutgoingFetch(
          new Request(input, init),
          response,
          performance.now() - start,
        ),
      );
    }

    return response;
  };
