export const sha1 = async (text: string) => {
  const buffer = await crypto.subtle
    .digest("SHA-1", new TextEncoder().encode(text));

  const hex = Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hex;
};

export const NOT_IMPLEMENTED = () => {
  throw new Error("Not Implemented");
};

export const baseCache = {
  add: NOT_IMPLEMENTED,
  addAll: NOT_IMPLEMENTED,
  delete: NOT_IMPLEMENTED,
  keys: NOT_IMPLEMENTED,
  match: NOT_IMPLEMENTED,
  matchAll: NOT_IMPLEMENTED,
  put: NOT_IMPLEMENTED,
};

export function createBaseCacheStorage(
  cacheStorageInner: CacheStorage,
  openCache: (
    cacheName: string,
    cacheInner: Cache,
    requestURLSHA1: (request: RequestInfo | URL) => Promise<string>,
  ) => Promise<Cache>,
): CacheStorage {
  const caches: CacheStorage = {
    delete: () => {
      throw new Error("Not Implemented");
    },
    has: () => {
      throw new Error("Not Implemented");
    },
    keys: () => {
      throw new Error("Not Implemented");
    },
    match: () => {
      throw new Error("Not Implemented");
    },
    open: async (cacheName: string): Promise<Cache> => {
      const cacheInner = await cacheStorageInner.open(cacheName);
      const requestURLSHA1 = (request: RequestInfo | URL) =>
        withCacheNamespace(cacheName)(request).then((key) =>
          "http://localhost:8000/" + key
        );
      const cache = Promise.resolve(
        openCache(cacheName, cacheInner, requestURLSHA1),
      );
      return cache;
    },
  };

  return caches;
}

export const assertNoOptions = (
  { ignoreMethod, ignoreSearch, ignoreVary }: CacheQueryOptions = {},
) => {
  if (ignoreMethod || ignoreSearch || ignoreVary) {
    throw new Error("Not Implemented");
  }
};

export const requestURL = (request: RequestInfo | URL): string => {
  return typeof request === "string"
    ? request
    : request instanceof URL
    ? request.href
    : request.url;
};

export const withCacheNamespace =
  (cacheName: string) => (request: RequestInfo | URL): Promise<string> => {
    return requestURLSHA1(request).then((key) => `${key}${cacheName}`);
  };

export const requestURLSHA1 = (request: RequestInfo | URL): Promise<string> => {
  return sha1(requestURL(request));
};

export const assertCanBeCached = (req: Request, response: Response) => {
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
};
