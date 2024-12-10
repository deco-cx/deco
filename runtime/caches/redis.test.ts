import { assertEquals } from "@std/assert";
import { create, type RedisConnection } from "./redis.ts";
import type { SetOptions } from "npm:@redis/client@^1.6.0";

Deno.test({
  name: ".match",
  sanitizeResources: false,
  sanitizeOps: false,
}, async (t) => {
  const namespace = "test";

  const store: RedisConnection = {
    get: (cacheKey: string): string => {
      const data: { [key: string]: string } = {
        a94a8fe5ccb19ba61c4c0873d391e987982fbbd3test: JSON.stringify({
          body: "body",
          status: 200,
        }),
      };

      return data[cacheKey];
    },
  } as unknown as RedisConnection;

  await t.step(
    "when the cache key exists",
    async () => {
      const client = create(store, namespace);
      const response = await client.match("test");

      assertEquals(response?.status, 200);
      assertEquals(await response?.text(), "body");
    },
  );

  await t.step(
    "when the cache key does not exist",
    async () => {
      const client = create(store, namespace);
      const response = await client.match("anything");

      assertEquals(response, undefined);
    },
  );

  await t.step(
    "when the cache key takes too long to return",
    async () => {
      const timeoutStore: RedisConnection = {
        get: (_: string): Promise<string> =>
          new Promise<string>((resolve) => {
            setTimeout(() => resolve("{}"), 10000);
          }),
      } as unknown as RedisConnection;

      const client = create(timeoutStore, namespace);
      const response = await client.match("slow");

      assertEquals(response, undefined);
    },
  );
});

Deno.test({
  name: ".delete",
  sanitizeResources: false,
  sanitizeOps: false,
}, async (t) => {
  const namespace = "test";

  const store: RedisConnection = {
    del: (cacheKey: string): Promise<number> => {
      const result = cacheKey === "a94a8fe5ccb19ba61c4c0873d391e987982fbbd3test"
        ? 1
        : 0;
      return Promise.resolve(result);
    },
  } as unknown as RedisConnection;

  await t.step(
    "when the cache key exists",
    async () => {
      const client = create(store, namespace);
      const response = await client.delete("test");

      assertEquals(response, true);
    },
  );

  await t.step(
    "when the cache key does not exist",
    async () => {
      const client = create(store, namespace);
      const response = await client.delete("anything");

      assertEquals(response, false);
    },
  );

  await t.step(
    "when the cache key takes too long to return",
    async () => {
      const timeoutStore: RedisConnection = {
        del: (_: string): Promise<number> =>
          new Promise<number>((resolve) => {
            setTimeout(() => resolve(1), 10000);
          }),
      } as unknown as RedisConnection;

      const client = create(timeoutStore, namespace);
      const response = await client.delete("slow");

      assertEquals(response, false);
    },
  );
});

Deno.test({
  name: ".put",
  sanitizeResources: false,
  sanitizeOps: false,
}, async (t) => {
  const namespace = "test";

  const store: RedisConnection = {
    set: (
      _cacheKey: string,
      _data: string,
      _options: SetOptions,
    ): Promise<string | null> => Promise.resolve(null),
  } as unknown as RedisConnection;

  await t.step(
    "when the cache key is successfully stored",
    async () => {
      const client = create(store, namespace);
      const response = await client.put("https://test.com", {} as Response);

      assertEquals(response, undefined);
    },
  );

  await t.step(
    "when the cache key takes too long to store",
    async () => {
      const timeoutStore: RedisConnection = {
        del: (_: string): Promise<number> =>
          new Promise<number>((resolve) => {
            setTimeout(() => resolve(1), 10000);
          }),
      } as unknown as RedisConnection;

      const client = create(timeoutStore, namespace);
      const response = await client.put("https://slow.com", {} as Response);

      assertEquals(response, undefined);
    },
  );
});
