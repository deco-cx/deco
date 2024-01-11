/// <reference lib="deno.unstable" />
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
 *    if (res.ok) expire oldMeta chunks
 *    else expire newMeta chunks
 */
import {
  compress,
  decompress,
  init as initZstd,
} from "https://denopkg.com/mcandeia/zstd-wasm@0.20.2/deno/zstd.ts";
import { ValueType } from "../../deps.ts";
import { meter } from "../../observability/otel/metrics.ts";
import {
  assertCanBeCached,
  assertNoOptions,
  requestURLSHA1,
} from "./common.ts";

interface Metadata {
  body: {
    etag: string; // body version
    chunks: number; // number of chunks in body
    zstd: boolean;
  };
  status: number;
  headers: [string, string][];
}

// Create an UpDownSumObserver to track the sum of buffer sizes
const bufferSizeSumObserver = meter.createUpDownCounter("buffer_size_sum", {
  description: "Sum of buffer sizes",
  unit: "1",
  valueType: ValueType.INT,
});

const compressDuration = meter.createHistogram("zstd_compress_duration", {
  description: "compress duration",
  unit: "ms",
  valueType: ValueType.DOUBLE,
});

const NAMESPACE = "CACHES";
const SMALL_EXPIRE_MS = 1_000 * 10; // 10seconds
const LARGE_EXPIRE_MS = 1_000 * 3600 * 24; // 1day

/** KV has a max of 64Kb per chunk */
const MAX_CHUNK_SIZE = 64512;
const MAX_CHUNKS_BATCH_SIZE = 10;
const MAX_UNCOMPRESSED_SIZE = MAX_CHUNK_SIZE * MAX_CHUNKS_BATCH_SIZE;

const zstdPromise = initZstd();

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
    await zstdPromise;

    const kv = await Deno.openKv();

    const keyForMetadata = (sha?: string) => {
      const key = [NAMESPACE, cacheName, "metas"];

      if (typeof sha === "string") {
        key.push(sha);
      }

      return key;
    };

    const keyForBodyChunk = (
      etag?: string,
      chunk?: number,
    ) => {
      const key: Array<string | number> = [NAMESPACE, cacheName, "chunks"];

      if (typeof etag === "string") {
        key.push(etag);

        if (typeof chunk === "number") {
          key.push(chunk);
        }
      }

      return key;
    };

    const removeBodyChunks = async (meta: Metadata) => {
      const { chunks, etag } = meta.body ?? {};

      if (!chunks || !etag) return;

      let ok = true;
      for (let it = 0; it < chunks; it++) {
        const key = keyForBodyChunk(etag, it);

        const chunk = await kv.get<Uint8Array>(key);

        if (!chunk.value) continue;

        const res = await kv
          .atomic()
          .check(chunk)
          .set(key, chunk, { expireIn: SMALL_EXPIRE_MS })
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
      return keyForMetadata(await requestURLSHA1(request));
    };

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

        const res = await kv.get<Metadata>(key, {
          consistency: "eventual",
        });
        const { value: metadata } = res;

        if (!metadata) return;

        const { body } = metadata;

        if (body.chunks === 0) {
          return new Response(null, metadata);
        }

        const many: Promise<Deno.KvEntryMaybe<Uint8Array>[]>[] = [];
        for (let i = 0; i < body.chunks; i += MAX_CHUNKS_BATCH_SIZE) {
          const batch = [];
          for (let j = 0; j < MAX_CHUNKS_BATCH_SIZE; j++) {
            batch.push(keyForBodyChunk(body.etag, i + j));
          }

          many.push(
            kv.getMany<Uint8Array[]>(batch, { consistency: "eventual" }),
          );
        }

        let length = 0;
        for (const chunks of many) {
          for (const chunk of await chunks) {
            length += chunk.value?.length ?? 0;
          }
        }

        const result = new Uint8Array(length);

        let bytes = 0;
        for (const chunks of many) {
          for (const chunk of await chunks) {
            if (!chunk.value) continue;

            result.set(chunk.value, bytes);
            bytes += chunk.value.length ?? 0;
          }
        }

        return new Response(
          body.zstd ? decompress(result) : result,
          metadata,
        );
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

        const metaKey = await keyForRequest(req);
        const oldMeta = await kv.get<Metadata>(metaKey);

        const [buffer, zstd] = await response.arrayBuffer()
          .then((buffer) => new Uint8Array(buffer))
          .then((buffer) => {
            bufferSizeSumObserver.add(buffer.length);
            return buffer;
          })
          .then((buffer) => {
            if (buffer.length > MAX_UNCOMPRESSED_SIZE) {
              const start = performance.now();
              const compressed = compress(buffer, 4);
              compressDuration.record(performance.now() - start, {
                bufferSize: buffer.length,
                compressedSize: compressed.length,
              });
              return [compressed, true] as const;
            }
            return [buffer, false] as const;
          });

        // Orphaned chunks to remove after metadata change
        let orphaned = oldMeta.value;
        const chunks = Math.ceil(buffer.length / MAX_CHUNK_SIZE);
        const newMeta: Metadata = {
          status: response.status,
          headers: [...response.headers.entries()],
          body: { etag: crypto.randomUUID(), chunks, zstd },
        };

        try {
          // Save each file chunk
          // Note that chunks expiration should be higher than metadata
          // to avoid reading a file with missing chunks
          for (let it = 0; it < chunks; it++) {
            const res = await kv.set(
              keyForBodyChunk(newMeta.body.etag, it),
              buffer.slice(
                it * MAX_CHUNK_SIZE,
                (it + 1) * MAX_CHUNK_SIZE,
              ),
              { expireIn: LARGE_EXPIRE_MS + SMALL_EXPIRE_MS },
            );

            if (!res.ok) {
              throw new Error("Error while saving chunk to KV");
            }
          }

          // Save file metadata
          const res = await kv.set(metaKey, newMeta, {
            expireIn: LARGE_EXPIRE_MS,
          });

          if (!res.ok) {
            throw new Error("Could not set our metadata");
          }
        } catch (error) {
          orphaned = newMeta;
          console.error(error);
        }

        if (orphaned) {
          await removeBodyChunks(orphaned);
        }
      },
    };
  },
};
