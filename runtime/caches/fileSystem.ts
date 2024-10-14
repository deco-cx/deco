import { existsSync } from "@std/fs";
import { logger } from "../../observability/otel/config.ts";

import {
  assertCanBeCached,
  assertNoOptions,
  withCacheNamespace,
} from "./utils.ts";

const FILE_SYSTEM_CACHE_DIRECTORY =
  Deno.env.get("FILE_SYSTEM_CACHE_DIRECTORY") ?? "/tmp/deco_cache";

// Function to convert headers object to a Uint8Array
function headersToUint8Array(headers: [string, string][]) {
  const headersStr = JSON.stringify(headers);
  return new TextEncoder().encode(headersStr);
}

// Function to combine the body and headers into a single buffer
function generateCombinedBuffer(body: Uint8Array, headers: Uint8Array) {
  // This prepends the header length to the combined buffer. As it has 4 bytes in size,
  // it can store up to 2^32 - 1 bytes of headers (4GB). This should be enough for all deco use cases.
  const headerLength = new Uint8Array(new Uint32Array([headers.length]).buffer);

  // Concatenate length, headers, and body into one Uint8Array
  const combinedBuffer = new Uint8Array(
    headerLength.length + headers.length + body.length,
  );
  combinedBuffer.set(headerLength, 0);
  combinedBuffer.set(headers, headerLength.length);
  combinedBuffer.set(body, headerLength.length + headers.length);
  return combinedBuffer;
}

// Function to extract the headers and body from a combined buffer
function extractCombinedBuffer(combinedBuffer: Uint8Array) {
  // Extract the header length from the combined buffer
  const headerLengthArray = combinedBuffer.slice(0, 4);
  const headerLength = new Uint32Array(headerLengthArray.buffer)[0];

  // Extract the headers and body from the combined buffer
  const headers = combinedBuffer.slice(4, 4 + headerLength);
  const body = combinedBuffer.slice(4 + headerLength);
  return { headers, body };
}

function getIterableHeaders(headers: Uint8Array) {
  const headersStr = new TextDecoder().decode(headers);

  // Directly parse the string as an array of [key, value] pairs
  const headerPairs: [string, string][] = JSON.parse(headersStr);

  // Filter out any pairs with empty key or value
  const filteredHeaders = headerPairs.filter(([key, value]) =>
    key !== "" && value !== ""
  );
  return filteredHeaders;
}

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
  ) {
    if (!isCacheInitialized) {
      await assertCacheDirectory();
    }
    const filePath = `${FILE_SYSTEM_CACHE_DIRECTORY}/${key}`;

    await Deno.writeFile(filePath, responseArray);
    return;
  }

  async function getFile(key: string) {
    if (!isCacheInitialized) {
      await assertCacheDirectory();
    }
    try {
      const filePath = `${FILE_SYSTEM_CACHE_DIRECTORY}/${key}`;
      const fileContent = await Deno.readFile(filePath);
      return fileContent;
    } catch (err) {
      // Error code different for file/dir not found
      // The file won't be found in cases where it's not cached
      if (err.code !== "ENOENT") {
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
          _options?: CacheQueryOptions,
        ): Promise<boolean> => {
          const cacheKey = await requestURLSHA1(request);
          const deleteResponse = await deleteFile(cacheKey);
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
          const data = await getFile(cacheKey);

          if (data === null) {
            return undefined;
          }

          const { headers, body } = extractCombinedBuffer(data);
          const iterableHeaders = getIterableHeaders(headers);
          const responseHeaders = new Headers(iterableHeaders);
          return new Response(
            body,
            { headers: responseHeaders },
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

          if (!response.body) {
            return;
          }

          const cacheKey = await requestURLSHA1(request);

          const bodyBuffer = await response.arrayBuffer()
            .then((buffer) => new Uint8Array(buffer))
            .then((buffer) => {
              return buffer;
            });
          const headersBuffer = headersToUint8Array([
            ...response.headers.entries(),
          ]);
          const buffer = generateCombinedBuffer(bodyBuffer, headersBuffer);

          await putFile(
            cacheKey,
            buffer,
          ).catch(
            (err) => {
              console.error("file system error", err);
            },
          );
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
