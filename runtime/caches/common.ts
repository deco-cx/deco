import { logger } from "../../observability/otel/config.ts";
import { sha1 } from "../utils.ts";

export const assertNoOptions = (
  { ignoreMethod, ignoreSearch, ignoreVary }: CacheQueryOptions = {},
) => {
  if (ignoreMethod || ignoreSearch || ignoreVary) {
    throw new Error("Not Implemented");
  }
};

export const requestURL = (request: RequestInfo | URL): string => {
  return typeof request === "string"
    ? request
    : request instanceof URL
    ? request.href
    : request.url;
};

export const withCacheNamespace =
  (cacheName: string) => (request: RequestInfo | URL): Promise<string> => {
    return requestURLSHA1(request).then((key) => `${key}${cacheName}`);
  };

export const requestURLSHA1 = (request: RequestInfo | URL): Promise<string> => {
  return sha1(requestURL(request));
};

export const assertCanBeCached = (req: Request, response: Response) => {
  if (!/^http(s?):\/\//.test(req.url)) {
    throw new TypeError(
      "Request url protocol must be 'http:' or 'https:'",
    );
  }
  if (req.method !== "GET") {
    throw new TypeError("Request method must be GET");
  }

  if (response.status === 206) {
    throw new TypeError("Response status must not be 206");
  }
};

export interface CacheMetrics {
  engine: string;
  total: number;
  hits: number;
}
const cachesMetrics: CacheMetrics[] = [];

setInterval(() => {
  for (const cacheMetrics of cachesMetrics) {
    const { total, hits, engine } = cacheMetrics;
    if (total === 0) {
      continue;
    }
    const percentage = hits / total;
    console.info(`cache@${engine}:${total}:${hits}:${percentage.toFixed(2)}`);
    logger.info(
      `cache@${engine}:${total}:${hits}:${percentage.toFixed(2)}`,
    );
    cacheMetrics.total = 0;
    cacheMetrics.hits = 0;
  }
}, 30 * 1e3);

export const withInstrumentation = (
  cache: CacheStorage,
  engine: string,
): CacheStorage => {
  const metric = { engine, total: 0, hits: 0 };
  cachesMetrics.push(metric);
  return {
    ...cache,
    open: async (cacheName) => {
      const cacheImpl = await cache.open(cacheName);
      return {
        ...cacheImpl,
        match: async (req, opts) => {
          const isMatch = await cacheImpl.match(req, opts);
          metric.total++;
          isMatch && metric.hits++;
          return isMatch;
        },
      };
    },
  };
};
