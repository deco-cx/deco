import { ValueType } from "../../deps.ts";
import { tracer } from "../../observability/otel/config.ts";
import { meter } from "../../observability/otel/metrics.ts";
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
const cacheHit = meter.createCounter("cache_hit", {
  unit: "1",
  valueType: ValueType.INT,
});

export const withInstrumentation = (
  cache: CacheStorage,
  engine: string,
): CacheStorage => {
  return {
    ...cache,
    open: async (cacheName) => {
      const cacheImpl = await cache.open(cacheName);
      return {
        ...cacheImpl,
        match: async (req, opts) => {
          const span = tracer.startSpan("cache-match", {
            attributes: { engine },
          });
          try {
            const isMatch = await cacheImpl.match(req, opts);
            const result = isMatch ? "hit" : "miss";
            span.addEvent("cache-result", { result });
            cacheHit.add(1, {
              result,
              engine,
            });
            return isMatch;
          } catch (err) {
            span.recordException(err);
            throw err;
          } finally {
            span.end();
          }
        },
      };
    },
  };
};
