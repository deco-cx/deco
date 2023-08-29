/**
 * WebCache API powered by Deno.KV
 *
 * This creates two indices on KV, one for metadata and another for body chunks.
 *
 * 1. ['CACHES', cacheName, 'metas', key] // response.status, response.headers, response.etag
 * 2. ['CACHES', cacheName, 'chunks', etag, chunkId] // response.body for response.etag
 *
 * `key` is determined after the orignal request. Etag is an uuid representing the
 * response's body version. ChunkId is the chunk number after splitting the body response's
 * into 64Kb chunks.
 *
 * How it works:
 *
 * getMedata (request):
 *    key <- sha1(request.url + request.headers)
 *
 *    return key from 'metas' index on Deno.KV
 *
 * match (request, response):
 *    metadata <- getMetadata(request)
 *
 *    if metadata not exists:
 *      return
 *
 *    lru.touch(key) // update key in lru index used for eviction
 *
 *    etag <- metadata.etag
 *    body <- create stream from etag chunks
 *
 *    return Response(body, metadata)
 *
 * put (request, response):
 *    oldMeta <- getMetadata(request)
 *    newMeta <- { status: response.status, headers: response.headers, etag: new UUID() }
 *
 *    save chunks for response with newMetag.etag on chunks index
 *    res <- atomically replace oldMeta with newMeta
 *
 *    lru.touch(key) // insert key in lru index and evict least recently used if necessary
 *
 *    if (res.ok) expire oldMeta chunks
 *    else expire newMeta chunks
 */

import { sha1 } from "../utils.ts";

interface Metadata {
  body?: {
    etag: string; // body version
    chunks: number; // number of chunks in body
  } | null;
  status: number;
  headers: [string, string][];
}

interface Chunk {
  metadata: string[];
  expireAt: number;
  data: Uint8Array;
}

/** LRU index used for housekeeping KV */
const createIndex = (
  { size, onEvict }: { size: number; onEvict?: (keys: string[]) => void },
) => {
  const index = new Set<string>();

  return {
    touch: (keys: string[]) => {
      const key = keys.at(-1)!;
      const has = index.has(key);

      if (!has && index.size > size) {
        const evicted = index.keys().next().value;
        index.delete(evicted);
        onEvict?.([...keys.slice(0, -1), evicted]);
      }

      index.delete(key);
      index.add(key);
    },
  };
};

const assertNoOptions = (
  { ignoreMethod, ignoreSearch, ignoreVary }: CacheQueryOptions = {},
) => {
  if (ignoreMethod || ignoreSearch || ignoreVary) {
    throw new Error("Not Implemented");
  }
};

const MAX_METAS = 1e3;
const NAMESPACE = "CACHES";
const HOUSEKEEPING_INTERVAL_MS = 10 * 60 * 1000; // 10minutes

const SMALL_EXPIRE_MS = 1_000 * 10; // 10seconds
const LARGE_EXPIRE_MS = 1_000 * 3600 * 24; // 1day

export const caches: CacheStorage = {
  delete: async (cacheName: string): Promise<boolean> => {
    const kv = await Deno.openKv();

    for await (
      const entry of kv.list({ prefix: [NAMESPACE, cacheName] })
    ) {
      await kv.delete(entry.key);
    }

    return true;
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
  open: async (cacheName: string): Promise<Cache> => {
    const kv = await Deno.openKv();
    const lru = createIndex({
      size: MAX_METAS,
      onEvict: (key) => remove(key).catch(console.error),
    });

    const keyForMetadata = (sha?: string) =>
      [NAMESPACE, cacheName, "metas", sha]
        .filter((x): x is string => typeof x === "string");

    const keyForBodyChunk = (
      etag?: string,
      chunk?: number,
    ) =>
      [NAMESPACE, cacheName, "chunks", etag, chunk]
        .filter((x): x is string | number =>
          typeof x === "string" || typeof x === "number"
        );

    const removeBodyChunks = async (meta: Metadata) => {
      const { chunks, etag } = meta.body ?? {};

      if (!chunks || !etag) return;

      let ok = true;
      for (let it = 0; it < chunks; it++) {
        const key = keyForBodyChunk(etag, it);

        const chunk = await kv.get<Chunk>(key);

        if (!chunk.value) continue;

        const newChunk: Chunk = {
          ...chunk.value,
          expireAt: Date.now() + SMALL_EXPIRE_MS,
        };

        const res = await kv
          .atomic()
          .check(chunk)
          .set(key, newChunk)
          .commit();

        ok &&= res.ok;
      }

      if (!ok) {
        throw new Error(
          `Error while reducing expire rate for chunk ${keyForBodyChunk(etag)}`,
        );
      }
    };

    const remove = async (key: string[]) => {
      const metadata = await kv.get<Metadata>(key);
      await kv.delete(key);

      if (metadata.value) {
        await removeBodyChunks(metadata.value);
      }
    };

    const keyForRequest = async (request: RequestInfo | URL) => {
      const url = typeof request === "string"
        ? request
        : request instanceof URL
        ? request.href
        : request.url;

      return keyForMetadata(await sha1(url));
    };

    const housekeeper = () => {
      let running = false;

      return async () => {
        if (running) return;

        running = true;

        try {
          for await (
            const { key, value } of kv.list<Chunk>({
              prefix: keyForBodyChunk(),
            })
          ) {
            if (!value) {
              await kv.delete(key);

              continue;
            }

            const etag = key.at(-2);
            const { metadata, expireAt } = value;

            if (expireAt > Date.now()) continue;

            const meta = await kv.get<Metadata>(metadata);

            if (meta.value?.body?.etag !== etag) {
              await kv.delete(key);
            }
          }
        } finally {
          running = false;
        }
      };
    };

    setInterval(housekeeper(), HOUSEKEEPING_INTERVAL_MS);

    return {
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

        const key = await keyForRequest(request);
        await remove(key);

        return true;
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

        const key = await keyForRequest(request);

        const { value: metadata } = await kv.get<Metadata>(key, {
          consistency: "eventual",
        });

        if (!metadata) return;

        const { body } = metadata;

        lru.touch(key);

        // Stream body from KV
        let iterator = 0;
        const MAX_KV_BATCH_SIZE = 10;
        const stream = body
          ? new ReadableStream({
            async pull(controller) {
              try {
                const keys = new Array(MAX_KV_BATCH_SIZE)
                  .fill(0)
                  .map((_, index) => index + iterator)
                  .filter((chunk) => chunk < body.chunks)
                  .map((chunk) => keyForBodyChunk(body.etag, chunk));

                if (keys.length === 0) return controller.close();

                const chunks = await kv.getMany<Chunk[]>(keys, {
                  consistency: "eventual",
                });

                for (const { value } of chunks) {
                  value?.data && controller.enqueue(value.data);
                }

                iterator += MAX_KV_BATCH_SIZE;
              } catch (error) {
                controller.error(error);
              }
            },
          })
          : null;

        return new Response(stream, metadata);
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

        if (!/^http(s?):\/\//.test(req.url)) {
          throw new TypeError(
            "Request url protocol must be 'http:' or 'https:'",
          );
        }
        if (req.method !== "GET") {
          throw new TypeError("Request method must be GET");
        }

        if (response.status === 206) {
          throw new TypeError("Response status must not be 206");
        }

        const metaKey = await keyForRequest(req);
        const oldMeta = await kv.get<Metadata>(metaKey);

        // Transform 8Kb stream into 64Kb KV stream
        let accumulator = new Uint8Array();
        const KV_CHUNK_SIZE = 64512; // 63Kb
        const kvChunks = new TransformStream({
          transform(chunk, controller) {
            if (
              accumulator.byteLength + chunk.byteLength > KV_CHUNK_SIZE
            ) {
              controller.enqueue(accumulator);

              accumulator = new Uint8Array(chunk);
            } else {
              accumulator = new Uint8Array([
                ...accumulator,
                ...chunk,
              ]);
            }
          },
          flush(controller) {
            if (accumulator.byteLength > 0) {
              controller.enqueue(accumulator);
            }
          },
        });
        response.body?.pipeThrough(kvChunks);

        // Orphaned chunks to remove after metadata change
        const newMeta: Metadata = {
          status: response.status,
          headers: [...response.headers.entries()],
          body: response.body && {
            etag: crypto.randomUUID(),
            chunks: 0,
          },
        };
        let orphaned = oldMeta.value;

        try {
          // Save each file chunk
          // Note that chunks expiration should be higher than metadata
          // to avoid reading a file with missing chunks
          const reader = kvChunks.readable.getReader();

          for (; newMeta.body && true; newMeta.body.chunks++) {
            const { value, done } = await reader.read();

            if (done) break;

            const chunkKey = keyForBodyChunk(
              newMeta.body.etag,
              newMeta.body.chunks,
            );
            const chunk: Chunk = {
              metadata: metaKey,
              expireAt: Date.now() + LARGE_EXPIRE_MS + SMALL_EXPIRE_MS,
              data: value,
            };
            const res = await kv.set(chunkKey, chunk);

            if (!res.ok) {
              throw new Error("Error while saving chunk to KV");
            }
          }

          // Save file metadata
          const res = await kv
            .atomic()
            .check(oldMeta)
            .set(metaKey, newMeta, {
              // expireIn: LARGE_EXPIRE_MS,
            })
            .commit();

          if (!res.ok) {
            throw new Error("Could not set our metadata");
          }
        } catch {
          orphaned = newMeta;
        }

        // Update LRU index
        lru.touch(metaKey);

        if (orphaned) {
          await removeBodyChunks(orphaned);
        }
      },
    };
  },
};
