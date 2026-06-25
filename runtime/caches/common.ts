import { type Exception, ValueType } from "../../deps.ts";
import { tracer } from "../../observability/otel/config.ts";
import { meter } from "../../observability/otel/metrics.ts";
import {
  ATTR_DECO_CACHE_ENGINE,
  ATTR_DECO_CACHE_RESULT,
  ATTR_DECO_CACHE_STATUS,
  METRIC_DECO_CACHE_LOOKUPS,
} from "../../observability/otel/conventions.ts";
import { inFuture } from "./utils.ts";

export interface CacheMetrics {
  engine: string;
  total: number;
  hits: number;
}
const cacheHit = meter.createCounter(METRIC_DECO_CACHE_LOOKUPS, {
  unit: "1",
  valueType: ValueType.DOUBLE,
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
            attributes: { [ATTR_DECO_CACHE_ENGINE]: engine },
          });
          try {
            const isMatch = await cacheImpl.match(req, opts);
            //there is an edge case where there is no expires header, but technically our loader always sets it
            const result = getCacheStatus(isMatch);

            span.setAttribute(ATTR_DECO_CACHE_STATUS, result);
            cacheHit.add(1, {
              [ATTR_DECO_CACHE_RESULT]: result,
              [ATTR_DECO_CACHE_ENGINE]: engine,
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
