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
// Additional stale window in milliseconds added on top of the response's expires header.
// Keeps the Redis key alive past its expiration so the loader can detect and serve stale content
// while revalidating in the background (stale-while-revalidate pattern).
// Falls back to TTL-based expiration when the response has no expires header.
const STALE_TTL_PERIOD = parseInt(
  Deno.env.get("LOADER_CACHE_REDIS_STALE_TTL_PERIOD_MS") ?? "30000",
);
const SITE_NAME = Deno.env.get("DECO_SITE_NAME") ?? "";
// Distributed revalidation lock — prevents multiple pods from revalidating the same
// stale key simultaneously (thundering herd across instances).
// The lock uses SET NX EX so it is atomic, short-lived, and self-heals if the pod dies.
// Disabled by default; enable with LOADER_CACHE_REDIS_REVALIDATION_LOCK=true.
const REVALIDATION_LOCK_ENABLED =
  Deno.env.get("LOADER_CACHE_REDIS_REVALIDATION_LOCK") === "true";
const REVALIDATION_LOCK_TTL_S = parseInt(
  Deno.env.get("LOADER_CACHE_REDIS_REVALIDATION_LOCK_TTL_S") ?? "15",
);
// The cache namespace used by loader.ts — lock keys must match the same key space.
const LOCK_NAMESPACE = "loader";
const SENTINEL_URLS = Deno.env.get("LOADER_CACHE_REDIS_SENTINEL_URLS");
const SENTINEL_NAME = Deno.env.get("LOADER_CACHE_REDIS_SENTINEL_NAME") ??
  "mymaster";
const SENTINEL_PASSWORD = Deno.env.get("LOADER_CACHE_REDIS_SENTINEL_PASSWORD");
const REDIS_PASSWORD = Deno.env.get("LOADER_CACHE_REDIS_PASSWORD");
const REDIS_READ_URL = Deno.env.get("LOADER_CACHE_REDIS_READ_URL");

export type RedisConnection = Redis;

export interface RevalidationLocker {
  tryAcquire: (request: RequestInfo | URL) => Promise<boolean>;
}

/**
 * Creates a revalidation locker backed by a Redis connection.
 * Exported for testing — production code uses the `revalidationLocker` singleton.
 *
 * @param redis     Redis connection to use for locking (null → always allow).
 * @param enabled   Whether the lock is active (defaults to REVALIDATION_LOCK_ENABLED env var).
 * @param ttlSeconds  Lock TTL in seconds (defaults to REVALIDATION_LOCK_TTL_S env var).
 */
export function createRevalidationLocker(
  redis: RedisConnection | null,
  enabled = REVALIDATION_LOCK_ENABLED,
  ttlSeconds = REVALIDATION_LOCK_TTL_S,
): RevalidationLocker {
  return {
    tryAcquire: async (request: RequestInfo | URL): Promise<boolean> => {
      if (!enabled || redis === null) return true;
      try {
        const key = await withCacheNamespace(LOCK_NAMESPACE)(request);
        const lockKey = `${SITE_NAME ? `${SITE_NAME}:` : ""}${key}:lock`;
        const result = await waitOrReject(
          () =>
            redis?.set(lockKey, "1", "EX", ttlSeconds, "NX") ??
              Promise.resolve(null),
          COMMAND_TIMEOUT,
        );
        return result === "OK";
      } catch {
        return true; // fail-open: Redis down or timeout → allow revalidation
      }
    },
  };
}

// Shared Redis connection — set by caches.open() once the connection is ready.
// The locker reuses it so no extra connection is created and there is no cold-start race.
let _sharedRedis: RedisConnection | null = null;

/**
 * Module-level singleton revalidation locker.
 * Reuses the Redis connection created by caches.open(), which is called at app init
 * time (loader.ts), so the connection is already ready before the first stale request.
 * Always fail-open: if Redis is unavailable or the lock times out, revalidation proceeds normally.
 */
export const revalidationLocker: RevalidationLocker = {
  tryAcquire: (request) =>
    createRevalidationLocker(_sharedRedis).tryAcquire(request),
};

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

const sharedOptions = {
  enableOfflineQueue: false,
  connectTimeout: CONNECTION_TIMEOUT,
  maxRetriesPerRequest: 1,
};

function createRedisClient(): Redis {
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

function createReadRedisClient(): Redis {
  return new Redis(REDIS_READ_URL!, {
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
    headers: Object.fromEntries(response.headers.entries()),
    status: response.status,
  });
}

function deserialize(raw: string): Response {
  const { body, headers, status } = JSON.parse(raw);
  return new Response(body, { headers, status });
}

export function create(
  redis: RedisConnection | null,
  namespace: string,
  redisRead?: RedisConnection | null,
) {
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
            () => (redisRead ?? redis)?.get(cacheKey) ?? Promise.resolve(null),
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

      const expires = response.headers.get("expires");
      const parsedExpires = expires ? Date.parse(expires) : NaN;
      const expirationTimestamp = Number.isFinite(parsedExpires)
        ? parsedExpires
        : Date.now() + TTL * 1000;
      const ttlSeconds = Math.max(
        1,
        Math.ceil(
          ((expirationTimestamp - Date.now()) + STALE_TTL_PERIOD) / 1000,
        ),
      );

      serialize(response)
        .then((data) =>
          waitOrReject<string | null>(
            () => redis?.set(cacheKey, data, "EX", ttlSeconds) ?? Promise.resolve(null),
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
    let redisRead: null | RedisConnection = null;

    if (isAvailable) {
      redis = createRedisClient();
      redis.on("error", (err: Error) => {
        console.error("[redis-cache] connection error:", err?.message ?? err);
      });

      if (REDIS_READ_URL) {
        redisRead = createReadRedisClient();
        redisRead.on("error", (err: Error) => {
          console.error(
            "[redis-cache] read connection error:",
            err?.message ?? err,
          );
        });
      }

      await wait(CONNECTION_TIMEOUT);

      if (redis.status !== "ready") {
        console.warn(
          `[redis-cache] connection not ready after ${CONNECTION_TIMEOUT}ms (status: ${redis.status}). Commands will be dropped until connected.`,
        );
      }

      // Share the ready connection with revalidationLocker so it reuses it
      // instead of creating a separate connection with a cold-start race.
      _sharedRedis = redis;
      if (redisRead && redisRead.status !== "ready") {
        console.warn(
          `[redis-cache] read connection not ready after ${CONNECTION_TIMEOUT}ms (status: ${redisRead.status}). Read commands will be dropped until connected.`,
        );
      }
    }

    return Promise.resolve(create(redis, namespace, redisRead));
  },
  delete: NOT_IMPLEMENTED,
  has: NOT_IMPLEMENTED,
  keys: NOT_IMPLEMENTED,
  match: NOT_IMPLEMENTED,
};
