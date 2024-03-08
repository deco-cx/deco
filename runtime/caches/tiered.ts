import { logger, tracer } from "../../observability/otel/config.ts";
import { caches as cachesKV } from "./denoKV.ts";
import { caches as cachesFileSystem } from "./fileSystem.ts";
import { caches as cachesS3 } from "./s3.ts";

const inFuture = (maybeDate: string) => {
  try {
    return new Date(maybeDate) > new Date();
  } catch {
    return false;
  }
};
const isCache = (c: Cache | undefined): c is Cache => typeof c !== "undefined";

function createTieredCache(...tieredCaches: (CacheStorage | undefined)[]): CacheStorage {
    const openedCaches: Cache[] = [];
  async function updateTieredCaches(
    indexOfCachesToUpdate: Array<number>,
    request: RequestInfo | URL,
    matched: Response,
  ) {
    const putPromises = indexOfCachesToUpdate.map((index) => openedCaches[index].put(request, matched));
    await Promise.all(putPromises);
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
        console.log("Openning cache!! ",cacheName);
        let maybeCache: Cache | undefined;
        for (const caches of tieredCaches) {
            if (caches) {
                console.log("IS CACHE");
                await caches.open(cacheName)
                    .then((c) => maybeCache = c)
                    .catch((error) => {
                        console.error("Error caught:", error);
                        maybeCache = undefined;
                    });
                console.log("MAYBE CACHE: ", isCache(maybeCache))
                if (isCache(maybeCache)) {
                    console.log("PUSHHHHH")
                    openedCaches.push(maybeCache);
                }
            } else {
                console.log("IS NOT CACHE");
            }
        }
        console.log("openedCaches length: ", openedCaches.length);
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
          let deleteResponse;
          for (const caches of openedCaches) {
            deleteResponse = await caches.delete(request, options);
          }
          return deleteResponse ?? false;
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
            console.log("entering tiered match")
          let matched;
          const indexOfCachesToUpdate = [];
          for (const [index, caches] of openedCaches.entries()) {
            console.log("match: ", index);
            matched = await caches.match(request, options).catch(() => null);
            if (!matched) {
                console.log("- not matched: ", index);
              indexOfCachesToUpdate.push(index);
              continue;
            }

            const expires = matched.headers.get("expires");
            const isStale = expires ? !inFuture(expires) : false;

            if (isStale) {
                console.log("- is stale: ", index);
              indexOfCachesToUpdate.push(index);
            } else {
              // found a match, no need to check the rest
              console.log("- matched: ", index);
              break;
            }
          }
          console.log("indexOfCachesToUpdate: ", indexOfCachesToUpdate);
          if (matched) {
            updateTieredCaches(indexOfCachesToUpdate, request, matched);
            console.log("- returning match\n\n")
            return matched;
          } else {
            console.log("- returning undefined\n\n")
            return undefined;
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
            const putPromises = openedCaches.map((caches) => caches.put(request, response));
            await Promise.all(putPromises);
        },
      });
    },
  };

//   return tieredCaches.length > 0 ? caches : undefined;
return caches;
}

export const caches = createTieredCache(cachesFileSystem, cachesS3, cachesKV);
