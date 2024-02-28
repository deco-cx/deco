import { logger, tracer } from "../../observability/otel/config.ts";
import { meter } from "../../observability/otel/metrics.ts";
import { ValueType } from "../../deps.ts";
import {
  assertCanBeCached,
  assertNoOptions,
  withCacheNamespace,
} from "./common.ts";
import {
  compress,
  decompress,
  init as initZstd,
} from "https://denopkg.com/mcandeia/zstd-wasm@0.20.2/deno/zstd.ts";

const MAX_UNCOMPRESSED_SIZE =
  parseInt(Deno.env.get("FILE_SYSTEM_MAX_UNCOMPRESSED_SIZE")! ?? "645120");

const ENABLE_FILE_SYSTEM_CACHE = Deno.env.get("ENABLE_FILE_SYSTEM_CACHE") !== undefined;
const FILE_SYSTEM_CACHE_DIRECTORY = Deno.env.get("FILE_SYSTEM_CACHE_DIRECTORY") ?? "cache";

const zstdPromise = initZstd();

const downloadDuration = meter.createHistogram("file_system_cache_download_duration", {
  description: "file system cache download duration",
  unit: "ms",
  valueType: ValueType.DOUBLE,
});

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

interface Metadata {
  body: {
    etag: string; // body version
    buffer: Uint8Array; // buffer with compressed data
    zstd: boolean;
  };
}

function bufferToObject(
  buffer: { [key: string]: number } | Uint8Array,
): Uint8Array {
  if (buffer instanceof Uint8Array) {
    return buffer;
  }

  const length = Object.keys(buffer).length;
  const array = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    array[i] = buffer[i.toString()];
  }
  return array;
}

function createFileSystemCache(): CacheStorage {
  async function putFile(
    key: string,
    responseObject: Metadata,
  ) {
    const filePath = `${FILE_SYSTEM_CACHE_DIRECTORY}/${key}`;
    const fileContent = JSON.stringify(responseObject);
    await Deno.writeTextFile(filePath, fileContent);
    return;
  }

  async function getFile(key: string) {
    try {
      const filePath = `${FILE_SYSTEM_CACHE_DIRECTORY}/${key}`;
      const fileContent = await Deno.readTextFile(filePath);
      return fileContent;
    } catch (err) {
      logger.error(`error when reading from file system, ${err}`);
      return null;
    }
  }

  async function deleteFile(key: string) {
    try {
      const filePath = `${FILE_SYSTEM_CACHE_DIRECTORY}/${key}`;
      await Deno.remove(filePath);
      return true;
    } catch (err) {
      logger.error(`error when deleting from file system, ${err}`);
      return false;
    }
  }

  const caches: CacheStorage = {
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
    open: async (cacheName: string): Promise<Cache> => {
      await zstdPromise;
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

          const deleteResponse = await deleteFile(
            await requestURLSHA1(request),
          );
          return deleteResponse;
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
          const span = tracer.startSpan("file-system-get", {
            attributes: {
              cacheKey,
            },
          });
          try {
            const startTime = performance.now();
            const data = await getFile(cacheKey);
            const downloadDurationTime = performance.now() - startTime;

            span.addEvent("file-system-get-data");
            
            if (data === null) {
              span.addEvent("cache-miss");
              return undefined;
            }
            span.addEvent("cache-hit");

            const parsedData: Metadata = typeof data === "string"
              ? JSON.parse(data)
              : data;
            parsedData.body.buffer = bufferToObject(parsedData.body.buffer);

            downloadDuration.record(downloadDurationTime, {
              bufferSize: parsedData.body.buffer.length,
              compressed: parsedData.body.zstd,
            });

            return new Response(
              parsedData.body.zstd
                ? decompress(parsedData.body.buffer)
                : parsedData.body.buffer,
            );
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

          const span = tracer.startSpan("file-system-put", {
            attributes: {
              cacheKey,
            },
          });

          try {
            try {
              const newMeta: Metadata = {
                body: { etag: crypto.randomUUID(), buffer, zstd },
              };

              const setSpan = tracer.startSpan("file-system-set", {
                attributes: { cacheKey },
              });
              putFile(cacheKey, newMeta).catch(
                (err) => {
                  console.error("file system error", err);
                  setSpan.recordException(err);
                },
              ).finally(() => {
                setSpan.end();
              }); // do not await for setting cache
            } catch (error) {
              logger.error(`error saving to file system ${error?.message}`);
            }
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
  return caches;
}

export const caches = ENABLE_FILE_SYSTEM_CACHE
  ? createFileSystemCache()
  : undefined;
