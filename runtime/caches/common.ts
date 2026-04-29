import { ValueType } from "../../deps.ts";
import { meter } from "../../observability/otel/metrics.ts";
import { inFuture } from "./utils.ts";

export interface CacheMetrics {
  engine: string;
  total: number;
  hits: number;
}
const cacheHit = meter.createCounter("cache_hit", {
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
          const isMatch = await cacheImpl.match(req, opts);
          const result = getCacheStatus(isMatch);

          cacheHit.add(1, {
            result,
            engine,
          });
          return isMatch;
        },
      };
    },
  };
};
