import { sha1 } from "../utils.ts";

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

  if (response.headers.get("set-cookie") !== null) {
    throw new TypeError("Response with `set-cookie` header cannot be cached")
  }
};
