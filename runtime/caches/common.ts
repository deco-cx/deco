import { ValueType } from "../../deps.ts";
import { tracer } from "../../observability/otel/config.ts";
import { meter } from "../../observability/otel/metrics.ts";

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
        delete: cacheImpl.delete.bind(cacheImpl),
        put: cacheImpl.put.bind(cacheImpl),
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
