import { logger } from "../../observability/otel/config.ts";

const logCacheErr = (cache: CacheStorage, msg: string) => (err: unknown) => {
  logger.error(
    `[${cache}] ${msg}: ${err}`,
  );
  return null;
};

export const compose = (
  ...storages: CacheStorage[]
): CacheStorage => {
  if (storages.length === 1) {
    return storages[0];
  }
  return storages.slice(1).reduce((storage, current) => {
    return {
      ...storage,
      open: async (cacheName) => {
        const [st, curr] = await Promise.all([
          storage.open(cacheName).catch(
            logCacheErr(storage, `error opening cache with name ${cacheName}`),
          ),
          current.open(cacheName).catch(
            logCacheErr(current, `error opening cache with name ${cacheName}`),
          ),
        ]);
        if (st === null || curr === null) {
          const cache = st ?? curr;
          if (!cache) {
            throw new TypeError("none of caches are available to be used");
          }
          return cache;
        }
        return {
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
            return await Promise.all([
              st.delete(request, options),
              curr.delete(request, options),
            ]).then((values) => values.every((s) => s)); // all values should be deleted to avoid inconsistencies
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
            const fromStoragePromise = st.match(request, options);
            const currentPromise = curr.match(request, options);

            const cached = await Promise.race([
              fromStoragePromise,
              currentPromise,
            ]);

            if (cached) {
              return cached;
            }
            return await Promise.all([fromStoragePromise, currentPromise]).then(
              (responses) => responses.filter(Boolean)[0],
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
            await Promise.all([
              st.put(request, response),
              curr.put(request, response),
            ]);
          },
        };
      },
    };
  }, storages[0]);
};
