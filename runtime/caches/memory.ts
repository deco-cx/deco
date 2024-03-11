import { logger, tracer } from "../../observability/otel/config.ts";
import { meter } from "../../observability/otel/metrics.ts";
import { ValueType } from "../../deps.ts";
import {
  assertCanBeCached,
  assertNoOptions,
  withCacheNamespace,
} from "./common.ts";
import { weakcache } from "../../deps.ts";

const MEMORY_CACHE_SIZE =
  parseInt(Deno.env.get("MEMORY_CACHE_SIZE") ?? "1048576");

const ENABLE_MEMORY_CACHE = Deno.env.get("ENABLE_MEMORY_CACHE") === "true";

const downloadDuration = meter.createHistogram(
  "memory_cache_download_duration",
  {
    description: "memory cache download duration",
    unit: "ms",
    valueType: ValueType.DOUBLE,
  },
);

const bufferSizeSumObserver = meter.createUpDownCounter("buffer_size_sum", {
  description: "Sum of buffer sizes",
  unit: "1",
  valueType: ValueType.INT,
});

function createMemoryCache(): CacheStorage {
  console.log("memory cache");
  const memory_cache = new weakcache.WeakLRUCache({ cacheSize: MEMORY_CACHE_SIZE });

  const caches: CacheStorage = {
    delete: (_cacheName: string): Promise<boolean> => {
      throw new Error("Not Implemented");
    },
    has: (_cacheName: string): Promise<boolean> => {
      throw new Error("Not Implemented");
    },
    keys: (): Promise<string[]> => {
      throw new Error("Not Implemented");
    },
    match: (
      _request: URL | RequestInfo,
      _options?: MultiCacheQueryOptions | undefined,
    ): Promise<Response | undefined> => {
      throw new Error("Not Implemented");
    },
    open: (cacheName: string): Promise<Cache> => {
      const requestURLSHA1 = withCacheNamespace(cacheName);
      console.log("open memory");
      return Promise.resolve({
        /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Cache/add) */
        add: (_request: RequestInfo | URL): Promise<void> => {
          throw new Error("Not Implemented");
        },
        /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Cache/addAll) */
        addAll: (_requests: RequestInfo[]): Promise<void> => {
          throw new Error("Not Implemented");
        },
        /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Cache/delete) */
        delete: async (
          request: RequestInfo | URL,
          options?: CacheQueryOptions,
        ): Promise<boolean> => {
          assertNoOptions(options);

          const deleteResponse = memory_cache.delete(
            await requestURLSHA1(request),
          );
          return deleteResponse;
        },
        /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Cache/keys) */
        keys: (
          _request?: RequestInfo | URL,
          _options?: CacheQueryOptions,
        ): Promise<ReadonlyArray<Request>> => {
          throw new Error("Not Implemented");
        },
        /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Cache/match) */
        match: async (
          request: RequestInfo | URL,
          options?: CacheQueryOptions,
        ): Promise<Response | undefined> => {
          assertNoOptions(options);
          const cacheKey = await requestURLSHA1(request);
          const span = tracer.startSpan("memory-get", {
            attributes: {
              cacheKey,
            },
          });
          try {
            const startTime = performance.now();
            const data = memory_cache.get(cacheKey);
            const downloadDurationTime = performance.now() - startTime;

            span.addEvent("memory-get-data");

            if (data === null) {
              span.addEvent("cache-miss");
              return undefined;
            }
            span.addEvent("cache-hit");

            downloadDuration.record(downloadDurationTime, {
              bufferSize: data.length,
            });

            return new Response(
              data,
            );
          } catch (err) {
            span.recordException(err);
            throw err;
          } finally {
            span.end();
          }
        },
        /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Cache/matchAll) */
        matchAll: (
          _request?: RequestInfo | URL,
          _options?: CacheQueryOptions,
        ): Promise<ReadonlyArray<Response>> => {
          throw new Error("Not Implemented");
        },
        /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Cache/put) */
        put: async (
          request: RequestInfo | URL,
          response: Response,
        ): Promise<void> => {
          const req = new Request(request);
          assertCanBeCached(req, response);

          if (!response.body) {
            return;
          }

          const cacheKey = await requestURLSHA1(request);
          const buffer = await response.arrayBuffer()
            .then((buffer) => new Uint8Array(buffer))
            .then((buffer) => {
              bufferSizeSumObserver.add(buffer.length);
              return buffer;
            });

          const span = tracer.startSpan("memory-put", {
            attributes: {
              cacheKey,
            },
          });

          try {
            try {
              const setSpan = tracer.startSpan("memory-set", {
                attributes: { cacheKey },
              });
              await memory_cache.set(cacheKey, buffer);
              setSpan.end();
            } catch (error) {
              logger.error(`error saving to memory ${error?.message}`);
            }
          } catch (err) {
            span.recordException(err);
            throw err;
          } finally {
            span.end();
          }
        },
      });
    },
  };

  return caches;
}

export const caches = ENABLE_MEMORY_CACHE
  ? createMemoryCache()
  : undefined;
