import { logger, tracer } from "../../observability/otel/config.ts";
import { meter } from "../../observability/otel/metrics.ts";
import { ValueType } from "../../deps.ts";
import {
  assertCanBeCached,
  assertNoOptions,
  withCacheNamespace,
} from "./common.ts";
import { existsSync } from "std/fs/mod.ts";
import { LRUCache } from "https://esm.sh/lru-cache@10.2.0";
import { numToUint8Array, uint8ArrayToNum } from "../utils.ts";

const FILE_SYSTEM_CACHE_DIRECTORY =
  Deno.env.get("FILE_SYSTEM_CACHE_DIRECTORY") ?? undefined;

const MAX_CACHE_SIZE = parseInt(Deno.env.get("MAX_CACHE_SIZE") ?? "1073741824"); // 1 GB max size of cache
const TTL_AUTOPURGE = Deno.env.get("TTL_AUTOPURGE") !== "false"; // automatically delete expired items
const TTL_RESOLUTION = parseInt(Deno.env.get("TTL_RESOLUTION") ?? "30000"); // check for expired items every 30 seconds

const downloadDuration = meter.createHistogram(
  "file_system_cache_download_duration",
  {
    description: "file system cache download duration",
    unit: "ms",
    valueType: ValueType.DOUBLE,
  },
);

const bufferSizeSumObserver = meter.createUpDownCounter("buffer_size_sum", {
  description: "Sum of buffer sizes",
  unit: "1",
  valueType: ValueType.INT,
});

const cacheOptions = {
  maxSize: MAX_CACHE_SIZE,
  ttlAutopurge: TTL_AUTOPURGE,
  ttlResolution: TTL_RESOLUTION,
  sizeCalculation: (value: Uint8Array) => {
    return uint8ArrayToNum(value); // return the length of the array
  },
  dispose: (_value: Uint8Array, key: string) => {
    Deno.remove(`${FILE_SYSTEM_CACHE_DIRECTORY}/${key}`).catch((err) =>
      console.error(`Failed to delete ${key}:`, err)
    );
  },
};

const fileCache = new LRUCache(cacheOptions);

function createFileSystemCache(): CacheStorage {
  let isCacheInitialized = false;
  async function assertCacheDirectory() {
    try {
      if (
        FILE_SYSTEM_CACHE_DIRECTORY && !existsSync(FILE_SYSTEM_CACHE_DIRECTORY)
      ) {
        await Deno.mkdirSync(FILE_SYSTEM_CACHE_DIRECTORY, { recursive: true });
      }
      isCacheInitialized = true;
    } catch (err) {
      console.error("Unable to initialize file system cache directory", err);
    }
  }

  async function putFile(
    key: string,
    responseArray: Uint8Array,
    expires: string,
  ) {
    if (!isCacheInitialized) {
      await assertCacheDirectory();
    }
    const filePath = `${FILE_SYSTEM_CACHE_DIRECTORY}/${key}`;
    await Deno.writeFile(filePath, responseArray);

    const expirationTimestamp = Date.parse(expires); // Convert expires string to a number representing the expiration timestamp
    fileCache.set(key, numToUint8Array(responseArray.length), {
      ttl: expirationTimestamp, // ttl of file added
    }); // Add to cache, which may trigger disposal of old item
    return;
  }

  async function getFile(key: string) {
    if (!isCacheInitialized) {
      await assertCacheDirectory();
    }
    try {
      if (fileCache.has(key)) {
        // Update the access time in the cache
        fileCache.get(key);
      }
      const filePath = `${FILE_SYSTEM_CACHE_DIRECTORY}/${key}`;
      const fileContent = await Deno.readFile(filePath);
      return fileContent;
    } catch (err) {
      // Error code different for file/dir not found
      // The file won't be found in cases where it's not cached
      if (err.code === "ENOENT") {
        logger.warning(
          `file not found when reading from file system, path: ${FILE_SYSTEM_CACHE_DIRECTORY}/${key}`,
        );
      } else {
        logger.error(`error when reading from file system, ${err}`);
      }
      return null;
    }
  }

  async function deleteFile(key: string) {
    if (!isCacheInitialized) {
      await assertCacheDirectory();
    }
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
    open: (cacheName: string): Promise<Cache> => {
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
              return undefined;
            }

            downloadDuration.record(downloadDurationTime, {
              bufferSize: data.length,
            });

            return new Response(
              data,
            );
          } catch (err) {
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
          const buffer = await response.arrayBuffer()
            .then((buffer) => new Uint8Array(buffer))
            .then((buffer) => {
              bufferSizeSumObserver.add(buffer.length);
              return buffer;
            });

          const span = tracer.startSpan("file-system-put", {
            attributes: {
              cacheKey,
            },
          });

          try {
            try {
              const setSpan = tracer.startSpan("file-system-set", {
                attributes: { cacheKey },
              });
              await putFile(
                cacheKey,
                buffer,
                response.headers.get("expires") ?? "",
              ).catch(
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

const hasWritePerm = async (): Promise<boolean> => {
  return await Deno.permissions.query(
    { name: "write", path: FILE_SYSTEM_CACHE_DIRECTORY } as const,
  ).then((status) => status.state === "granted");
};

export const isFileSystemAvailable = await hasWritePerm() &&
  FILE_SYSTEM_CACHE_DIRECTORY !== undefined;

export const caches = createFileSystemCache();
