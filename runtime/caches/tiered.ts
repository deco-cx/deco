const inFuture = (maybeDate: string) => {
  try {
    return new Date(maybeDate) > new Date();
  } catch {
    return false;
  }
};

/**
 * Creates a lightweight Response from pre-read body bytes and headers.
 * Avoids Response.clone() which duplicates the full SharedArrayBuffer backing store
 * and shares internal tee state that prevents GC of the original response.
 */
function responseFromBody(
  body: ArrayBuffer,
  headers: Headers,
  status: number,
): Response {
  return new Response(body, { headers, status });
}

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
          let matched: Response | undefined;
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

          if (!matched) return undefined;

          if (indexOfCachesToUpdate.length > 0) {
            // Read body bytes ONCE instead of using Response.clone() per tier.
            // clone() duplicates the full SharedArrayBuffer and creates tee'd streams
            // that keep both original and clone alive until both are fully consumed.
            // With fire-and-forget backfill, clones linger until all puts complete.
            const body = await matched.arrayBuffer();
            const { headers, status } = matched;

            // Backfill lower-priority tiers with independent responses from shared bytes
            Promise.all(
              indexOfCachesToUpdate.map((index) =>
                openedCaches[index].put(
                  request,
                  responseFromBody(body, headers, status),
                )
              ),
            ).catch(() => {});

            // Return a new response for the caller (original body was consumed above)
            return responseFromBody(body, headers, status);
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
          if (openedCaches.length === 0) return;
          if (openedCaches.length === 1) {
            // Single tier — no need to clone or read body separately
            return openedCaches[0].put(request, response);
          }
          // Read body once instead of clone() per tier.
          // clone() duplicates the SharedArrayBuffer for each tier, and all copies
          // stay alive until every tier's put() completes.
          const body = await response.arrayBuffer();
          const { headers, status } = response;

          await Promise.all(
            openedCaches.map((cache) =>
              cache.put(request, responseFromBody(body, headers, status))
            ),
          );
        },
      });
    },
  };
}
