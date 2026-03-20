import {
  assertCanBeCached,
  assertNoOptions,
  baseCache,
  NOT_IMPLEMENTED,
  withCacheNamespace,
} from "./utils.ts";
import { Redis } from "npm:ioredis@^5.10.1";

const CONNECTION_TIMEOUT = parseInt(
  Deno.env.get("LOADER_CACHE_REDIS_CONNECTION_TIMEOUT_MS") || "2000",
);
const COMMAND_TIMEOUT = 500;
const TTL = parseInt(Deno.env.get("LOADER_CACHE_REDIS_TTL_SECONDS") || "180"); // 3 minutes
const SITE_NAME = Deno.env.get("DECO_SITE_NAME") ?? "";
const SENTINEL_URLS = Deno.env.get("LOADER_CACHE_REDIS_SENTINEL_URLS");
const SENTINEL_NAME = Deno.env.get("LOADER_CACHE_REDIS_SENTINEL_NAME") ??
  "mymaster";
const SENTINEL_PASSWORD = Deno.env.get("LOADER_CACHE_REDIS_SENTINEL_PASSWORD");
const REDIS_PASSWORD = Deno.env.get("LOADER_CACHE_REDIS_PASSWORD");

export type RedisConnection = Redis;

export const isAvailable = Deno.env.has("LOADER_CACHE_REDIS_URL") ||
  !!SENTINEL_URLS;

function parseSentinels(
  raw: string,
): Array<{ host: string; port: number }> {
  return raw.split(",").map((entry) => {
    const [host, port] = entry.trim().split(":");
    return { host, port: parseInt(port ?? "26379") };
  });
}

function createRedisClient(): Redis {
  const sharedOptions = {
    enableOfflineQueue: false,
    connectTimeout: CONNECTION_TIMEOUT,
    maxRetriesPerRequest: 1,
  };

  if (SENTINEL_URLS) {
    return new Redis({
      ...sharedOptions,
      sentinels: parseSentinels(SENTINEL_URLS),
      name: SENTINEL_NAME,
      ...(SENTINEL_PASSWORD && { sentinelPassword: SENTINEL_PASSWORD }),
      ...(REDIS_PASSWORD && { password: REDIS_PASSWORD }),
    });
  }

  return new Redis(Deno.env.get("LOADER_CACHE_REDIS_URL")!, {
    ...sharedOptions,
    ...(REDIS_PASSWORD && { password: REDIS_PASSWORD }),
  });
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(() => resolve(true), ms));
}

function waitOrReject<T>(
  callback: () => Promise<T>,
  ms: number,
): Promise<T> {
  const timeout = new Promise<T>((_, reject) => {
    wait(ms).then(() => reject(new Error("Redis command timeout")));
  });

  return Promise.race([callback(), timeout]);
}

async function serialize(response: Response): Promise<string> {
  const body = await response.text();

  return JSON.stringify({
    body,
    headers: response.headers,
    status: response.status,
  });
}

function deserialize(raw: string): Response {
  const { body, headers, status } = JSON.parse(raw);
  return new Response(body, { headers, status });
}

export function create(redis: RedisConnection | null, namespace: string) {
  const generateKey = async (request: RequestInfo | URL): Promise<string> => {
    const key = await withCacheNamespace(namespace)(request);
    return SITE_NAME ? `${SITE_NAME}:${key}` : key;
  };

  return {
    ...baseCache,
    delete: async (
      request: RequestInfo | URL,
      options?: CacheQueryOptions,
    ): Promise<boolean> => {
      assertNoOptions(options);

      const result = await generateKey(request)
        .then((cacheKey: string) =>
          waitOrReject<number>(
            () => redis?.del(cacheKey) ?? Promise.resolve(0),
            COMMAND_TIMEOUT,
          )
        )
        .catch(() => 0);

      return result > 0;
    },
    match: async (
      request: RequestInfo | URL,
      options?: CacheQueryOptions,
    ): Promise<Response | undefined> => {
      assertNoOptions(options);

      const result = await generateKey(request)
        .then((cacheKey: string) =>
          waitOrReject<string | null>(
            () => redis?.get(cacheKey) ?? Promise.resolve(null),
            COMMAND_TIMEOUT,
          )
        )
        .then((result: string | null) => {
          if (!result) {
            return undefined;
          }

          return deserialize(result);
        })
        .catch(() => undefined);

      return result;
    },
    put: async (
      request: RequestInfo | URL,
      response: Response,
    ): Promise<void> => {
      const req = new Request(request);
      assertCanBeCached(req, response);

      if (!response.body) {
        return;
      }

      const cacheKey = await generateKey(request);

      serialize(response)
        .then((data) =>
          waitOrReject<string | null>(
            () => redis?.set(cacheKey, data, "EX", TTL) ?? Promise.resolve(null),
            COMMAND_TIMEOUT,
          )
        )
        .catch(() => {});
    },
  };
}

export const caches: CacheStorage = {
  open: async (namespace: string): Promise<Cache> => {
    let redis: null | RedisConnection = null;

    if (isAvailable) {
      redis = createRedisClient();
      redis.on("error", (err: Error) => {
        console.error("[redis-cache] connection error:", err?.message ?? err);
      });
      await wait(CONNECTION_TIMEOUT);
      if (redis.status !== "ready") {
        console.warn(
          `[redis-cache] connection not ready after ${CONNECTION_TIMEOUT}ms (status: ${redis.status}). Commands will be dropped until connected.`,
        );
      }
    }

    return Promise.resolve(create(redis, namespace));
  },
  delete: NOT_IMPLEMENTED,
  has: NOT_IMPLEMENTED,
  keys: NOT_IMPLEMENTED,
  match: NOT_IMPLEMENTED,
};
