import { type Exception, ValueType } from "../../deps.ts";
import { tracer } from "../../observability/otel/config.ts";
import { meter } from "../../observability/otel/metrics.ts";
import { inFuture } from "./utils.ts";

export interface CacheMetrics {
  engine: string;
  total: number;
  hits: number;
}
const cacheHit = meter.createCounter("cache_hit", {
  unit: "1",
  valueType: ValueType.INT,
});

const getCacheStatus = (
  isMatch: Response | undefined,
): "miss" | "stale" | "hit" => {
  if (!isMatch) return "miss";

  const expires = isMatch.headers.get("expires");
  const isStale = expires ? !inFuture(expires) : false;

  return isStale ? "stale" : "hit";
};

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
        delete: cacheImpl.delete.bind(cacheImpl),
        put: cacheImpl.put.bind(cacheImpl),
        match: async (req, opts) => {
          const span = tracer.startSpan("cache-match", {
            attributes: { engine },
          });
          try {
            const isMatch = await cacheImpl.match(req, opts);
            //there is an edge case where there is no expires header, but technically our loader always sets it
            const result = getCacheStatus(isMatch);

            span.setAttribute("status", result);
            cacheHit.add(1, {
              result,
              engine,
            });
            return isMatch;
          } catch (err) {
            span.recordException(err as Exception);
            throw err;
          } finally {
            span.end();
          }
        },
      };
    },
  };
};
