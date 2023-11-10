import { WeakLRUCache } from "https://deno.land/x/weakcache@v1.1.4/index.js";

const PROXY_ENABLED = Deno.env.get("ENABLE_DECO_PROXY_CACHE") !== "false";

const assertNoOptions = (
  { ignoreMethod, ignoreSearch, ignoreVary }: CacheQueryOptions = {},
) => {
  if (ignoreMethod || ignoreSearch || ignoreVary) {
    throw new Error("Not Implemented");
  }
};

export const caches: CacheStorage = {
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
  open: (_cacheName: string): Promise<Cache> => {
    const cache = new WeakLRUCache({ cacheSize: 200 });

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
      delete: (
        _request: RequestInfo | URL,
        _options?: CacheQueryOptions,
      ): Promise<boolean> => {
        throw new Error("Not Implemented");
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

        const isURL = (value: unknown): value is URL => {
          return value instanceof URL;
        };

        const prepareRequest = (request: RequestInfo | URL): Request => {
          if (!PROXY_ENABLED) {
            return new Request(request);
          }
          if (isURL(request) || typeof request === "string") {
            return new Request(
              `https://fastly.decocache.com/${request.toString()}`,
            );
          } else {
            const { method, headers, body } = request;
            return new Request(
              `https://fastly.decocache.com/${request.url}`,
              { method, headers, body },
            );
          }
        };

        const req = prepareRequest(request);

        const response = cache.has(req.url) ? cache.get(req.url) : await fetch(
          req,
        );

        return new Response(response.clone().body, response);
      },
      /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Cache/matchAll) */
      matchAll: (
        _request?: RequestInfo | URL,
        _options?: CacheQueryOptions,
      ): Promise<ReadonlyArray<Response>> => {
        throw new Error("Not Implemented");
      },
      /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Cache/put) */
      // deno-lint-ignore require-await
      put: async (
        request: RequestInfo | URL,
        response: Response,
      ): Promise<void> => {
        const req = new Request(request);

        if (!/^http(s?):\/\//.test(req.url)) {
          throw new TypeError(
            "Request url protocol must be 'http:' or 'https:'",
          );
        }
        if (req.method !== "GET") {
          throw new TypeError("Request method must be GET");
        }

        if (response.status === 206) {
          throw new TypeError("Response status must not be 206");
        }

        cache.insert(new Request(request).url, response);
      },
    });
  },
};
