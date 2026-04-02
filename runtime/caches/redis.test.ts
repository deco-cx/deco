import { assertEquals } from "@std/assert";
import {
  _compress,
  _decompress,
  create,
  createRevalidationLocker,
  type RedisConnection,
} from "./redis.ts";

Deno.test({
  name: ".match",
  sanitizeResources: false,
  sanitizeOps: false,
}, async (t) => {
  const namespace = "test";

  const store: RedisConnection = {
    getBuffer: (cacheKey: string): Uint8Array | null => {
      const data: { [key: string]: Uint8Array } = {
        a94a8fe5ccb19ba61c4c0873d391e987982fbbd3test: new TextEncoder().encode(
          JSON.stringify({ body: "body", status: 200 }),
        ),
      };
      return data[cacheKey] ?? null;
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
        getBuffer: (_: string): Promise<Uint8Array> =>
          new Promise<Uint8Array>((resolve) => {
            setTimeout(() => resolve(new TextEncoder().encode("{}")), 10000);
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

  const capturedArgs: { ttl: number }[] = [];
  const store: RedisConnection = {
    set: (
      _cacheKey: string,
      _data: string,
      _ex: string,
      ttl: number,
    ): Promise<string | null> => {
      capturedArgs.push({ ttl });
      return Promise.resolve(null);
    },
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
    "when response has expires header, TTL includes stale window",
    async () => {
      capturedArgs.length = 0;
      const futureExpires = new Date(Date.now() + 60_000).toUTCString();
      const headers = new Headers({
        "expires": futureExpires,
        "content-length": "4",
      });
      const res = new Response("body", { headers, status: 200 });
      const client = create(store, namespace);
      await client.put("https://test.com/expires", res);

      await new Promise((r) => setTimeout(r, 50));

      assertEquals(capturedArgs.length > 0, true);
      // TTL should be ~90s: 60s remaining + 30s stale window
      const ttl = capturedArgs[0].ttl;
      assertEquals(ttl >= 85 && ttl <= 95, true);
    },
  );

  await t.step(
    "when response has no expires header, TTL falls back to default",
    async () => {
      capturedArgs.length = 0;
      const headers = new Headers({ "content-length": "4" });
      const res = new Response("body", { headers, status: 200 });
      const client = create(store, namespace);
      await client.put("https://test.com/no-expires", res);

      await new Promise((r) => setTimeout(r, 50));

      assertEquals(capturedArgs.length > 0, true);
      // TTL should be ~210s: 180s default TTL + 30s stale window
      const ttl = capturedArgs[0].ttl;
      assertEquals(ttl >= 205 && ttl <= 215, true);
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

Deno.test({
  name: ".revalidationLocker",
  sanitizeResources: false,
  sanitizeOps: false,
}, async (t) => {
  await t.step(
    "when lock is disabled, always returns true without calling Redis",
    async () => {
      const store: RedisConnection = {
        set: () => {
          throw new Error("should not be called");
        },
      } as unknown as RedisConnection;
      const locker = createRevalidationLocker(store, false);
      assertEquals(await locker.tryAcquire("https://test.com"), true);
    },
  );

  await t.step(
    "when SET NX returns OK, returns true (lock acquired)",
    async () => {
      const store: RedisConnection = {
        set: () => Promise.resolve("OK"),
      } as unknown as RedisConnection;
      const locker = createRevalidationLocker(store, true, 15);
      assertEquals(await locker.tryAcquire("https://test.com"), true);
    },
  );

  await t.step(
    "lock key uses lock: prefix before site name",
    async () => {
      let capturedKey = "";
      const store: RedisConnection = {
        set: (key: string) => {
          capturedKey = key;
          return Promise.resolve("OK");
        },
      } as unknown as RedisConnection;
      const locker = createRevalidationLocker(store, true, 15);
      await locker.tryAcquire("https://test.com");
      assertEquals(capturedKey.startsWith("lock:"), true);
      assertEquals(capturedKey.endsWith(":lock"), false);
    },
  );

  await t.step(
    "when SET NX returns null, returns false (lock already held by another pod)",
    async () => {
      const store: RedisConnection = {
        set: () => Promise.resolve(null),
      } as unknown as RedisConnection;
      const locker = createRevalidationLocker(store, true, 15);
      assertEquals(await locker.tryAcquire("https://test.com"), false);
    },
  );

  await t.step(
    "when Redis throws, returns true (fail-open)",
    async () => {
      const store: RedisConnection = {
        set: () => Promise.reject(new Error("connection refused")),
      } as unknown as RedisConnection;
      const locker = createRevalidationLocker(store, true, 15);
      assertEquals(await locker.tryAcquire("https://test.com"), true);
    },
  );

  await t.step(
    "when Redis times out, returns true (fail-open)",
    async () => {
      const store: RedisConnection = {
        set: (): Promise<string | null> => new Promise(() => {}), // never resolves
      } as unknown as RedisConnection;
      const locker = createRevalidationLocker(store, true, 15);
      assertEquals(await locker.tryAcquire("https://test.com"), true);
    },
  );

  await t.step(
    "when redis is null, returns true (fail-open)",
    async () => {
      const locker = createRevalidationLocker(null, true, 15);
      assertEquals(await locker.tryAcquire("https://test.com"), true);
    },
  );
});

Deno.test({
  name: "compression round-trip",
  sanitizeResources: false,
  sanitizeOps: false,
}, async (t) => {
  const CODEC_GZIP = 0x01;
  const CODEC_DEFLATE = 0x02;
  const CODEC_LZ4 = 0x03;
  const CODEC_ZSTD = 0x04;

  const input = JSON.stringify({
    body: "hello world ".repeat(500),
    headers: { "content-type": "application/json" },
    status: 200,
  });

  for (
    const [name, codec] of [
      ["gzip", CODEC_GZIP],
      ["deflate", CODEC_DEFLATE],
      ["lz4", CODEC_LZ4],
      ["zstd", CODEC_ZSTD],
    ] as const
  ) {
    await t.step(`round-trip with ${name}`, async () => {
      const compressed = await _compress(input, codec);
      assertEquals(compressed[0], codec);
      const decompressed = await _decompress(compressed);
      assertEquals(decompressed, input);
    });
  }

  await t.step("compressed output is smaller than input", async () => {
    const inputBytes = new TextEncoder().encode(input).length;
    for (
      const [name, codec] of [
        ["gzip", CODEC_GZIP],
        ["deflate", CODEC_DEFLATE],
        ["lz4", CODEC_LZ4],
        ["zstd", CODEC_ZSTD],
      ] as const
    ) {
      const compressed = await _compress(input, codec);
      assertEquals(
        compressed.length < inputBytes,
        true,
        `${name}: compressed (${compressed.length}) should be smaller than input (${inputBytes})`,
      );
    }
  });
});
