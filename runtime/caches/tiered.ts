const inFuture = (maybeDate: string) => {
  try {
    return new Date(maybeDate) > new Date();
  } catch {
    return false;
  }
};

export function createTieredCache(
  ...tieredCaches: (CacheStorage | undefined)[]
): CacheStorage {
  const openedCaches: Cache[] = [];
  async function updateTieredCaches(
    indexOfCachesToUpdate: Array<number>,
    request: RequestInfo | URL,
    matched: Response,
  ) {
    const putPromises = indexOfCachesToUpdate.map((index) =>
      openedCaches[index].put(request, matched.clone())
    );
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
      await Promise.all(
        tieredCaches.filter(Boolean).map(async (cache) => {
          if (cache) {
            openedCaches.push(await cache.open(cacheName));
          }
        }),
      );
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
          let matched;
          const indexOfCachesToUpdate = [];
          for (const [index, caches] of openedCaches.entries()) {
            matched = await caches.match(request, options).catch(() =>
              undefined
            );
            if (!matched) {
              indexOfCachesToUpdate.push(index);
              continue;
            }

            const expires = matched.headers.get("expires");
            const isStale = expires ? !inFuture(expires) : false;

            if (isStale) {
              indexOfCachesToUpdate.push(index);
            } else {
              // found a match, no need to check the rest
              break;
            }
          }
          matched &&
            updateTieredCaches(indexOfCachesToUpdate, request, matched);
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

  return caches;
}
