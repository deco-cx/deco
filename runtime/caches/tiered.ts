const inFuture = (maybeDate: string) => {
  try {
    return new Date(maybeDate) > new Date();
  } catch {
    return false;
  }
};

/**
 * Creates a tiered cache that combines multiple cache storages into a single cache storage.
 * The tiered cache will prioritize the caches in the order they are provided.
 * When a request is made to the tiered cache, it will first check if the request is available in any of the caches.
 * If a match is found, the response will be returned and the caches will be updated based on the cache priority.
 * If no match is found, the request will be fetched and stored in the caches based on the cache priority.
 * @param tieredCaches The cache storages to be combined into the tiered cache.
 * @returns The tiered cache storage.
 */
export function createTieredCache(
  ...tieredCaches: CacheStorage[]
): CacheStorage {
  return {
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
      const openedCaches: Cache[] = await Promise.all(
        tieredCaches.map((cache) => cache.open(cacheName)),
      );

      async function updateTieredCaches(
        indexOfCachesToUpdate: number[],
        request: RequestInfo | URL,
        matched: Response,
      ) {
        await Promise.all(
          indexOfCachesToUpdate.map((index) =>
            openedCaches[index].put(request, matched.clone())
          ),
        );
      }

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
          return await Promise.all(
            openedCaches.map((cache) => cache.delete(request, options)),
          )
            .then((results) => results.every((r) => r))
            .catch(() => false);
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
          let matched;
          const indexOfCachesToUpdate: number[] = [];
          for (const [index, cache] of openedCaches.entries()) {
            matched = await cache.match(request, options).catch(() =>
              undefined
            );

            if (!matched) {
              indexOfCachesToUpdate.push(index);
              continue;
            }

            const expires = matched.headers.get("expires");
            const isStale = expires ? !inFuture(expires) : false;

            if (!isStale) {
              // found a match that is not stale, no need to check the other caches
              break;
            }
            indexOfCachesToUpdate.push(index);
          }

          if (matched) {
            updateTieredCaches(indexOfCachesToUpdate, request, matched);
          }

          return matched;
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
          const putPromises = openedCaches.map((caches) =>
            caches.put(request, response.clone())
          );
          await Promise.all(putPromises);
        },
      });
    },
  };
}
