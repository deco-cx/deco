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
import { compress, decompress } from "npm:brotli-wasm@2.0.1";

const CONNECTION_TIMEOUT = 500;
const COMMAND_TIMEOUT = 500;
const RECONNECTION_TIMEOUT = 5000;
const TTL = parseInt(Deno.env.get("LOADER_CACHE_REDIS_TTL_SECONDS") || "3600");

interface RedisCommandTimeout extends Error {
}

export type RedisConnection = RedisClientType<
  RedisModules,
  RedisFunctions,
  RedisScripts
>;

export const isAvailable = Deno.env.has("LOADER_CACHE_REDIS_URL");

function base64Encode(buffer: Uint8Array): string {
  return btoa(String.fromCharCode(...buffer));
}

function base64Decode(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function serialize(response: Response): Promise<string> {
  const body = await response.text();
  const headersObj = Object.fromEntries(response.headers.entries()); // Converte Headers para objeto JSON
  const data = JSON.stringify({
    body,
    headers: headersObj,
    status: response.status,
  });
  const compressed = compress(new TextEncoder().encode(data));

  return base64Encode(compressed);
}

function deserialize(raw: string): Response {
  try {
    const compressed = base64Decode(raw);
    const decompressed = decompress(compressed);
    const { body, headers, status } = JSON.parse(
      new TextDecoder().decode(decompressed),
    );

    return new Response(body, { headers, status });
  } catch {
    const { body, status } = JSON.parse(raw);
    return new Response(body, { status });
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(() => resolve(true), ms));
}

function waitOrReject<T>(
  callback: () => Promise<T>,
  ms: number,
): Promise<T> {
  const timeout = new Promise<T>((_, reject) => {
    wait(ms).then(() => reject(new Error() as RedisCommandTimeout));
  });

  return Promise.race([
    callback(),
    timeout,
  ]);
}

export function create(redis: RedisConnection | null, namespace: string) {
  return {
    ...baseCache,
    delete: async (
      request: RequestInfo | URL,
      options?: CacheQueryOptions,
    ): Promise<boolean> => {
      assertNoOptions(options);

      const generateKey = withCacheNamespace(namespace);

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

      const generateKey = withCacheNamespace(namespace);

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

      const generateKey = withCacheNamespace(namespace);
      const cacheKey = await generateKey(request);

      serialize(response)
        .then((data) =>
          waitOrReject<string | null>(
            () =>
              redis?.set(cacheKey, data, { EX: TTL }) ?? Promise.resolve(null),
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

    await Promise.race([
      connect(),
      wait(CONNECTION_TIMEOUT),
    ]);

    return Promise.resolve(create(redis, namespace));
  },
  delete: NOT_IMPLEMENTED,
  has: NOT_IMPLEMENTED,
  keys: NOT_IMPLEMENTED,
  match: NOT_IMPLEMENTED,
};
