import { connect, Redis } from "https://deno.land/x/redis@v0.31.0/mod.ts";
import { logger } from "../../observability/otel/config.ts";
import { assertNoOptions, withCacheNamespace } from "./common.ts";

const redisHostname = Deno.env.get("REDIS_HOSTNAME");
const redisPort = Deno.env.get("REDIS_PORT");

interface ResponseMetadata {
  status: number;
  headers: [string, string][];
}

export const redis: null | Redis = redisHostname && redisPort
  ? await connect({
    hostname: redisHostname,
    port: redisPort,
  })
  : null;

function base64encode(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

function base64decode(str: string): string {
  return decodeURIComponent(atob(str));
}
const keysOf = (canonicalKey: string): [string, string] => {
  return [`${canonicalKey}@body`, `${canonicalKey}@meta`];
};
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
          ...(await requestURLSHA1(request).then(keysOf)),
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
        const [bodyKey, metaKey] = await requestURLSHA1(request).then(keysOf);
        const pl = redis.pipeline();
        pl.get(metaKey);
        pl.get(bodyKey);
        const [meta, body] = await pl.flush();
        if (meta === null || body === null) {
          return undefined;
        }

        if (meta instanceof Error || body instanceof Error) {
          logger.error(
            `error when reading from redis, ${meta.toString()} ${body.toString()}`,
          );
          return undefined;
        }

        if (typeof meta !== "string") {
          logger.error(
            `meta for ${metaKey} was stored in a invalid format, thus cache will not be used`,
          );
          return undefined;
        }
        if (typeof body !== "string") {
          logger.error(
            `body error for ${bodyKey} was store in a invalid format, thus cache will not be used`,
          );
          return undefined;
        }

        const parsedMeta: ResponseMetadata = JSON.parse(meta);
        return new Response(base64decode(body), {
          status: parsedMeta.status,
          headers: new Headers(parsedMeta.headers),
        });
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
        if (!response.body) {
          return;
        }
        const [bodyKey, metaKey] = await requestURLSHA1(request).then(keysOf);

        const newMeta: ResponseMetadata = {
          status: response.status,
          headers: [...response.headers.entries()],
        };
        const tx = redis.tx();
        tx.set(metaKey, JSON.stringify(newMeta));
        tx.set(bodyKey, await response.text().then(base64encode));
        await tx.flush();
      },
    });
  },
};
