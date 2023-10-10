import { Redis } from "https://deno.land/x/upstash_redis@v1.22.1/mod.ts";

import { logger, tracer } from "../../observability/otel/config.ts";
import {
  assertCanBeCached,
  assertNoOptions,
  withCacheNamespace,
} from "./common.ts";

const redisUrl = Deno.env.get("UPSTASH_REDIS_REST_URL");
const redisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");

export const redis = redisUrl && redisToken
  ? new Redis({
    url: redisUrl,
    token: redisToken,
    enableTelemetry: true,
  })
  : null;

interface ResponseMetadata {
  body: string;
  status: number;
  headers: [string, string][];
}

function base64encode(str: string): string {
  return btoa(encodeURIComponent(str));
}

function base64decode(str: string): string {
  return decodeURIComponent(atob(str));
}
export const caches: CacheStorage = {
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
    if (!redis) {
      throw new Error(
        "Redis coult not be used due to the lack of credentials.",
      );
    }
    const requestURLSHA1 = withCacheNamespace(cacheName);
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

        return await redis.del(
          await requestURLSHA1(request),
        ) > 0;
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
        const span = tracer.startSpan("redis-get", {
          attributes: {
            cacheKey,
          },
        });
        try {
          const data = await redis.get(cacheKey);
          if (data === null) {
            span.addEvent("cache-miss");
            return undefined;
          }
          span.addEvent("cache-hit");
          if (data instanceof Error) {
            logger.error(
              `error when reading from redis, ${data.toString()}`,
            );
            return undefined;
          }

          if (typeof data !== "object") {
            logger.error(
              `data for ${cacheKey} was stored in a invalid format, thus cache will not be used`,
            );
            return undefined;
          }

          const parsedData: ResponseMetadata = typeof data === "string"
            ? JSON.parse(data)
            : data;
          return new Response(base64decode(parsedData.body), {
            status: parsedData.status,
            headers: new Headers(parsedData.headers),
          });
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
        const span = tracer.startSpan("redis-put", {
          attributes: {
            cacheKey,
          },
        });

        try {
          let expires = response.headers.get("expires");
          if (!expires && (response.status >= 300 || response.status < 200)) { //cannot be cached
            span.addEvent("cannot-be-cached", {
              status: response.status,
              expires: expires ?? "undefined",
            });
            return;
          }
          expires ??= new Date(Date.now() + (180_000)).toUTCString();

          const expDate = new Date(expires);
          const timeMs = expDate.getTime() - Date.now();
          if (timeMs <= 0) {
            span.addEvent("negative-time-ms", { timeMs: `${timeMs}` });
            return;
          }

          response.text().then(base64encode).then((body) => {
            const newMeta: ResponseMetadata = {
              body,
              status: response.status,
              headers: [...response.headers.entries()],
            };

            const options = { px: timeMs };
            const setSpan = tracer.startSpan("redis-set", {
              attributes: { cacheKey },
            });
            redis.set(cacheKey, JSON.stringify(newMeta), options).catch(
              (err) => {
                console.error("redis error", err);
                setSpan.recordException(err);
              },
            ).finally(() => {
              setSpan.end();
            }); // do not await for setting cache
          }).catch((err) => {
            logger.error(`error saving to redis ${err?.message}`);
          });
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
