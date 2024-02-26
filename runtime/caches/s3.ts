import { logger, tracer } from "../../observability/otel/config.ts";
import { meter } from "../../observability/otel/metrics.ts";
import { ValueType } from "../../deps.ts";
import {
  assertCanBeCached,
  assertNoOptions,
  withCacheNamespace,
} from "./common.ts";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "https://esm.sh/@aws-sdk/client-s3@3.513.0";
import {
  compress,
  decompress,
  init as initZstd,
} from "https://denopkg.com/mcandeia/zstd-wasm@0.20.2/deno/zstd.ts";

const MAX_UNCOMPRESSED_SIZE = 645120; // Same as denoKV

const zstdPromise = initZstd();

const bucketName = Deno.env.get("CACHE_UPLOAD_BUCKET");
const awsRegion = Deno.env.get("CACHE_AWS_REGION");
const awsAccessKeyId = Deno.env.get("CACHE_AWS_ACCESS_KEY_ID")!;
const awsSecretAccessKey = Deno.env.get("CACHE_AWS_SECRET_ACCESS_KEY")!;
const awsEndpoint = Deno.env.get("CACHE_AWS_ENDPOINT");

const s3Client = new S3Client({
  region: awsRegion,
  credentials: {
    accessKeyId: awsAccessKeyId,
    secretAccessKey: awsSecretAccessKey,
  },
  useAccelerateEndpoint: true,
  endpoint: awsEndpoint,
});

const downloadDuration = meter.createHistogram("s3_download_duration", {
  description: "s3 download duration",
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
  status: number;
  headers: [string, string][];
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

async function putObject(
  key: string,
  responseObject: Metadata,
) {
  const bucketParams = {
    Bucket: bucketName,
    Key: key,
    Body: JSON.stringify(responseObject),
  };

  const command = new PutObjectCommand(bucketParams);
  const response = await s3Client.send(command);

  return response;
}

async function getObject(key: string) {
  const bucketParams = {
    Bucket: bucketName,
    Key: key,
  };

  const command = new GetObjectCommand(bucketParams);
  const response = await s3Client.send(command);

  return response;
}

async function deleteObject(key: string) {
  const bucketParams = {
    Bucket: bucketName,
    Key: key,
  };

  const command = new DeleteObjectCommand(bucketParams);
  const response = await s3Client.send(command);

  return response;
}

function createS3Caches(): CacheStorage {
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

          const deleteResponse = await deleteObject(
            await requestURLSHA1(request),
          );
          if (deleteResponse.$metadata.httpStatusCode === undefined) {
            return false;
          }
          return deleteResponse.$metadata.httpStatusCode == 204;
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
          const span = tracer.startSpan("s3-get", {
            attributes: {
              cacheKey,
            },
          });
          try {
            const startTime = performance.now();
            const getResponse = await getObject(cacheKey);

            span.addEvent("s3-get-response");
            if (getResponse.Body === undefined) {
              logger.error(`error when reading from s3, ${getResponse}`);
              return undefined;
            }
            const data = await getResponse.Body.transformToString();
            const downloadDurationTime = performance.now() - startTime;

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
              bufferSize: data.length,
              compressed: parsedData.body.zstd,
            });

            return new Response(
              parsedData.body.zstd
                ? decompress(parsedData.body.buffer)
                : parsedData.body.buffer,
              parsedData,
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

          const span = tracer.startSpan("s3-put", {
            attributes: {
              cacheKey,
            },
          });

          try {
            try {
              const newMeta: Metadata = {
                body: { etag: crypto.randomUUID(), buffer, zstd },
                status: response.status,
                headers: [...response.headers.entries()],
              };

              const setSpan = tracer.startSpan("s3-set", {
                attributes: { cacheKey },
              });
              putObject(cacheKey, newMeta).catch(
                (err) => {
                  console.error("s3 error", err);
                  setSpan.recordException(err);
                },
              ).finally(() => {
                setSpan.end();
              }); // do not await for setting cache
            } catch (error) {
              logger.error(`error saving to s3 ${error?.message}`);
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

export const caches =
  (((bucketName && awsRegion) || awsEndpoint) && awsAccessKeyId &&
      awsSecretAccessKey)
    ? createS3Caches()
    : undefined;
