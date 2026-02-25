// Reuse TextEncoder instance to avoid repeated instantiation
const textEncoder = new TextEncoder();

// Pre-computed hex lookup table — avoids Array.from + map + join per call
const HEX_LOOKUP: string[] = new Array(256);
for (let i = 0; i < 256; i++) {
  HEX_LOOKUP[i] = i.toString(16).padStart(2, "0");
}

export const sha1 = async (text: string) => {
  const buffer = await crypto.subtle
    .digest("SHA-1", textEncoder.encode(text));

  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += HEX_LOOKUP[bytes[i]];
  }
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

// Cache SHA1 results per URL — same URLs repeat across cache tiers and requests
const sha1Cache = new Map<string, string>();
const SHA1_CACHE_MAX_SIZE = 5000;

export const requestURLSHA1 = async (
  request: RequestInfo | URL,
): Promise<string> => {
  const url = requestURL(request);
  const cached = sha1Cache.get(url);
  if (cached !== undefined) return cached;
  const hash = await sha1(url);
  sha1Cache.set(url, hash);
  // Evict oldest entry when cache is full
  if (sha1Cache.size > SHA1_CACHE_MAX_SIZE) {
    const firstKey = sha1Cache.keys().next().value;
    if (firstKey !== undefined) sha1Cache.delete(firstKey);
  }
  return hash;
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
