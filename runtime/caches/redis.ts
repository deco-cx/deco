import {
  assertCanBeCached,
  assertNoOptions,
  baseCache,
  NOT_IMPLEMENTED,
  withCacheNamespace,
} from "./utils.ts";
import {
  createClient,
  type RedisClientType,
  type RedisFunctions,
  type RedisModules,
  type RedisScripts,
} from "npm:@redis/client@^1.6.0";

const CONNECTION_TIMEOUT = 500;
const RECONNECTION_TIMEOUT = 5000;
const TTL = parseInt(Deno.env.get("LOADER_CACHE_REDIS_TTL_SECONDS") || "3600");

type RedisConnection = RedisClientType<
  RedisModules,
  RedisFunctions,
  RedisScripts
>;

let redis: null | RedisConnection = null;

export const isAvailable = Deno.env.has("LOADER_CACHE_REDIS_URL");

function connect(): void {
  if (!isAvailable) {
    return;
  }

  redis ??= createClient({
    url: Deno.env.get("LOADER_CACHE_REDIS_URL"),
  });

  redis.on("error", () => {
    if (redis?.isOpen) {
      redis?.disconnect();
    }

    wait(RECONNECTION_TIMEOUT).then(() => redis?.connect());
  });

  redis.connect();
}

async function serialize(response: Response): Promise<string> {
  const body = await response.text();

  return JSON.stringify({
    body: body,
    headers: response.headers,
    status: response.status,
  });
}

function deserialize(raw: string): Response {
  const { body, headers, status } = JSON.parse(raw);
  return new Response(body, { headers, status });
}

function wait(ms: number) {
  return new Promise((run) => setTimeout(run, ms));
}

export const caches: CacheStorage = {
  open: async (namespace: string): Promise<Cache> => {
    await Promise.race([connect(), wait(CONNECTION_TIMEOUT)]);

    return Promise.resolve({
      ...baseCache,
      delete: async (
        request: RequestInfo | URL,
        _?: CacheQueryOptions,
      ): Promise<boolean> => {
        const generateKey = withCacheNamespace(namespace);

        return generateKey(request)
          .then((cacheKey: string) => {
            redis?.del(cacheKey);

            return true;
          })
          .catch(() => false);
      },
      match: async (
        request: RequestInfo | URL,
        options?: CacheQueryOptions,
      ): Promise<Response | undefined> => {
        assertNoOptions(options);

        const generateKey = withCacheNamespace(namespace);

        return generateKey(request)
          .then((cacheKey: string) => redis?.get(cacheKey) ?? null)
          .then((result: string | null) => {
            if (!result) {
              return undefined;
            }

            return deserialize(result);
          })
          .catch(() => undefined);
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

        const generateKey = withCacheNamespace(namespace);
        const cacheKey = await generateKey(request);

        serialize(response)
          .then((data) => redis?.set(cacheKey, data, { EX: TTL }))
          .catch(() => {});
      },
    });
  },
  delete: NOT_IMPLEMENTED,
  has: NOT_IMPLEMENTED,
  keys: NOT_IMPLEMENTED,
  match: NOT_IMPLEMENTED,
};
