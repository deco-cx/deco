const textEncoder = new TextEncoder();

const HEX_TABLE: string[] = Array.from(
  { length: 256 },
  (_, i) => i.toString(16).padStart(2, "0"),
);

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += HEX_TABLE[bytes[i]];
  }
  return hex;
}

const SHA1_CACHE_MAX = 2048;
const sha1Cache = new Map<string, Promise<string>>();

export const sha1 = (text: string): Promise<string> => {
  const cached = sha1Cache.get(text);
  if (cached !== undefined) return cached;

  if (sha1Cache.size >= SHA1_CACHE_MAX) {
    const firstKey = sha1Cache.keys().next().value;
    if (firstKey !== undefined) sha1Cache.delete(firstKey);
  }

  const promise = crypto.subtle
    .digest("SHA-1", textEncoder.encode(text))
    .then(bufferToHex);

  sha1Cache.set(text, promise);

  return promise;
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

export const inFuture = (maybeDate: string) => {
  try {
    return new Date(maybeDate) > new Date();
  } catch {
    return false;
  }
};
