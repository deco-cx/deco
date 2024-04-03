import {
  compress,
  decompress,
  init as initZstd,
} from "https://denopkg.com/mcandeia/zstd-wasm@0.20.2/deno/zstd.ts";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "https://esm.sh/@aws-sdk/client-s3@3.513.0";
import { Context } from "../../deco.ts";
import { ValueType } from "../../deps.ts";
import { logger, tracer } from "../../observability/otel/config.ts";
import { meter } from "../../observability/otel/metrics.ts";
import {
  assertCanBeCached,
  assertNoOptions,
  withCacheNamespace,
} from "./common.ts";

const MAX_UNCOMPRESSED_SIZE = parseInt(
  Deno.env.get("CACHE_AWS_MAX_UNCOMPRESSED_SIZE")!,
);

const zstdPromise = initZstd();

const bucketName = Deno.env.get("CACHE_UPLOAD_BUCKET");
const awsRegion = Deno.env.get("CACHE_AWS_REGION");
const awsAccessKeyId = Deno.env.get("CACHE_AWS_ACCESS_KEY_ID")!;
const awsSecretAccessKey = Deno.env.get("CACHE_AWS_SECRET_ACCESS_KEY")!;
const awsEndpoint = Deno.env.get("CACHE_AWS_ENDPOINT");

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
    buffer: Uint8Array; // buffer with compressed data
    zstd: boolean;
  };
}

function metadataToUint8Array(metadata: Metadata): Uint8Array {
  const { buffer, zstd } = metadata.body;
  const zstdArray = new Uint8Array([zstd ? 1 : 0]);
  const result = new Uint8Array(buffer.length + zstdArray.length);
  result.set(zstdArray);
  result.set(buffer, zstdArray.length);
  return result;
}

function createS3Caches(): CacheStorage {
  const s3Client = new S3Client({
    region: awsRegion,
    credentials: {
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
    },
    endpoint: awsEndpoint,
  });

  async function putObject(
    key: string,
    responseObject: Metadata,
  ) {
    const result = metadataToUint8Array(responseObject);

    const bucketParams = {
      Bucket: bucketName,
      Key: `${key}-${Context.active().site}`,
      Body: result,
    };

    const command = new PutObjectCommand(bucketParams);
    const response = await s3Client.send(command);

    return response;
  }

  async function getObject(key: string) {
    const bucketParams = {
      Bucket: bucketName,
      Key: `${key}-${Context.active().site}`,
    };

    const command = new GetObjectCommand(bucketParams);
    const response = await s3Client.send(command);

    return response;
  }

  async function deleteObject(key: string) {
    const bucketParams = {
      Bucket: bucketName,
      Key: `${key}-${Context.active().site}`,
    };

    const command = new DeleteObjectCommand(bucketParams);
    const response = await s3Client.send(command);

    return response;
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
            const data = await getResponse.Body.transformToByteArray();
            const downloadDurationTime = performance.now() - startTime;

            if (data === null) {
              return undefined;
            }

            // first byte is a flag to indicate if the buffer is compressed
            // check function metadataToUint8Array
            const zstd = data[0] === 1;
            const buffer = data.slice(1);

            downloadDuration.record(downloadDurationTime, {
              bufferSize: buffer.length,
              compressed: zstd,
            });

            return new Response(
              zstd ? decompress(buffer) : buffer,
            );
          } catch (err) {
            if (err instanceof NoSuchKey) {
              return undefined;
            }
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
              if (
                MAX_UNCOMPRESSED_SIZE && buffer.length > MAX_UNCOMPRESSED_SIZE
              ) {
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
                body: { buffer, zstd },
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
const isEndpointSet = (bucketName !== undefined && awsRegion !== undefined) ||
  awsEndpoint !== undefined;
const areCredentialsSet = awsAccessKeyId !== undefined &&
  awsSecretAccessKey !== undefined;
export const isS3Available = isEndpointSet && areCredentialsSet;

export const caches = createS3Caches();
