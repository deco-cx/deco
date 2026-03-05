import { existsSync } from "@std/fs";
import { logger } from "../../observability/otel/config.ts";
import type { CacheWriteMessage } from "./cacheWriteWorker.ts";

import {
  assertCanBeCached,
  assertNoOptions,
  withCacheNamespace,
} from "./utils.ts";

const FILE_SYSTEM_CACHE_DIRECTORY =
  Deno.env.get("FILE_SYSTEM_CACHE_DIRECTORY") ?? "/tmp/deco_cache";

// Reuse TextEncoder instance to avoid repeated instantiation
const textEncoder = new TextEncoder();

// Function to convert headers object to a Uint8Array
function headersToUint8Array(headers: [string, string][]) {
  const headersStr = JSON.stringify(headers);
  return textEncoder.encode(headersStr);
}

// Function to combine the body and headers into a single buffer
function generateCombinedBuffer(body: Uint8Array, headers: Uint8Array) {
  const hLen = headers.length;
  // Single allocation: 4 bytes for header length + headers + body
  const buf = new Uint8Array(4 + hLen + body.length);
  // Write header length as little-endian uint32 directly (avoids Uint32Array allocation)
  buf[0] = hLen & 0xFF;
  buf[1] = (hLen >> 8) & 0xFF;
  buf[2] = (hLen >> 16) & 0xFF;
  buf[3] = (hLen >> 24) & 0xFF;
  buf.set(headers, 4);
  buf.set(body, 4 + hLen);
  return buf;
}

// Function to extract the headers and body from a combined buffer
function extractCombinedBuffer(combinedBuffer: Uint8Array) {
  if (combinedBuffer.length < 4) {
    throw new Error("Malformed cache entry: buffer too small");
  }

  // Read header length as little-endian uint32 (matches generateCombinedBuffer write order)
  // Use >>> 0 to force unsigned interpretation after signed bitwise shifts
  const headerLength = (combinedBuffer[0] |
    (combinedBuffer[1] << 8) |
    (combinedBuffer[2] << 16) |
    (combinedBuffer[3] << 24)) >>> 0;

  if (headerLength > combinedBuffer.length - 4) {
    throw new Error("Malformed cache entry: header length exceeds buffer");
  }

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

// Worker for offloading cache writes from the main event loop.
// All serialization (JSON.stringify headers, generateCombinedBuffer) and
// FS I/O (Deno.writeFile) happen on the worker thread.
// Opt-in via DECO_CACHE_WRITE_WORKER=true.
const CACHE_WRITE_WORKER_ENABLED =
  Deno.env.get("DECO_CACHE_WRITE_WORKER") === "true";

let cacheWriteWorker: Worker | null = null;

function getCacheWriteWorker(): Worker | null {
  if (!CACHE_WRITE_WORKER_ENABLED) return null;
  if (cacheWriteWorker) return cacheWriteWorker;
  try {
    cacheWriteWorker = new Worker(
      import.meta.resolve("./cacheWriteWorker.ts"),
      { type: "module" },
    );
    cacheWriteWorker.onerror = (e) => {
      console.error("[cache-write-worker] fatal:", e.message);
      cacheWriteWorker = null;
    };
    return cacheWriteWorker;
  } catch (err) {
    console.error("[cache-write-worker] failed to start:", err);
    return null;
  }
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
    } catch (_err) {
      const err = _err as { code?: string };
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

          const worker = getCacheWriteWorker();
          if (worker) {
            // Offload serialization + FS write to worker thread.
            // The main event loop only reads the body; everything else
            // (SHA1 hash, header encoding, buffer combine, writeFile)
            // runs on the worker's thread.
            const bodyBuffer = new Uint8Array(await response.arrayBuffer());
            const headers: [string, string][] = [
              ...response.headers.entries(),
            ];
            const url = typeof request === "string"
              ? request
              : request instanceof URL
              ? request.href
              : request.url;
            const msg: CacheWriteMessage = {
              cacheDir: FILE_SYSTEM_CACHE_DIRECTORY,
              url,
              cacheName,
              body: bodyBuffer,
              headers,
            };
            // Transfer the body buffer to avoid copying
            worker.postMessage(msg, [bodyBuffer.buffer]);
            return;
          }

          // Fallback: no worker available, do it inline
          const cacheKey = await requestURLSHA1(request);
          const bodyBuffer = new Uint8Array(await response.arrayBuffer());
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
