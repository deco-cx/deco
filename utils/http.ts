import meta from "../meta.json" assert { type: "json" };
import { adminDomains, isAdmin, landingPageDomain } from "../utils/admin.ts";
import { buildObj } from "./object.ts";

export const DEFAULT_CACHE_CONTROL: CacheControl = {
  "s-maxage": 60, // 1minute cdn cache
  "max-age": 10, // 10s browser cache to avoid BYPASS on cloudflare: https://developers.cloudflare.com/cache/about/default-cache-behavior/#cloudflare-cache-responses
  "stale-while-revalidate": 3600, // 1hour
  "stale-if-error": 24 * 3600, // 1day
  public: true,
};

export type CacheControl = Partial<{
  "max-age": number;
  "s-maxage": number;
  "stale-while-revalidate": number;
  "stale-if-error": number;
  "public": boolean;
  "private": boolean;
  "no-cache": boolean;
  "no-store": boolean;
  "must-revalidate": boolean;
  "proxy-revalidate": boolean;
  "immutable": boolean;
  "no-transform": boolean;
}>;

const parseCacheControlSegment = (
  segment: string,
): CacheControl => {
  const [key, value] = segment.trim().split("=");

  switch (key) {
    case "max-age":
      return { [key]: Number(value) };
    case "s-maxage":
      return { [key]: Number(value) };
    case "stale-while-revalidate":
      return { [key]: Number(value) };
    case "stale-if-error":
      return { [key]: Number(value) };
    case "public":
      return { [key]: true };
    case "private":
      return { [key]: true };
    case "no-cache":
      return { [key]: true };
    case "no-store":
      return { [key]: true };
    case "must-revalidate":
      return { [key]: true };
    case "proxy-revalidate":
      return { [key]: true };
    case "immutable":
      return { [key]: true };
    case "no-transform":
      return { [key]: true };
  }

  throw new Error(`Unknown cache directive ${value}`);
};

export const parseVary = (headers: Headers): string[] => {
  const value = headers.get("vary");

  return value?.split(",").map((x) => x.trim()) ?? [];
};

export const formatVary = (vary: string[]) => vary.filter(Boolean).join(", ");

export const parseCacheControl = (headers: Headers): CacheControl => {
  const value = headers.get("cache-control");

  return value
    ?.split(",")
    .map((x) => x.trim())
    .reduce(
      (acc, curr) => ({
        ...parseCacheControlSegment(curr),
        ...acc,
      }),
      {} as CacheControl,
    ) ?? {};
};

export const formatCacheControl = (value: CacheControl) =>
  Object
    .entries(value)
    .map(([key, value]) =>
      value === true
        ? key
        : typeof value === "number"
        ? `${key}=${value}`
        : undefined
    )
    .filter(Boolean)
    .join(", ");

const min = (a?: number, b?: number) =>
  typeof a === "number" && typeof b === "number"
    ? (a < b ? a : b)
    : typeof a === "number"
    ? a
    : b;

export const mergeCacheControl = (
  h1: CacheControl,
  h2: CacheControl,
): CacheControl => {
  const maxAge = min(h1["max-age"], h2["max-age"]);
  const sMaxAge = min(h1["s-maxage"], h2["s-maxage"]);
  const staleWhileRevalidate = min(
    h1["stale-while-revalidate"],
    h2["stale-while-revalidate"],
  );
  const staleIfError = min(h1["stale-if-error"], h2["stale-if-error"]);
  const pub = h1["public"] || h2["public"];
  const pvt = h1["public"] || h2["public"];
  const noCache = h1["no-cache"] || h2["no-cache"];
  const noStore = h1["no-store"] || h2["no-store"];
  const mustRevalidate = h1["must-revalidate"] || h2["must-revalidate"];
  const proxyRevalidate = h1["proxy-revalidate"] || h2["proxy-revalidate"];
  const immutable = h1["immutable"] && h2["immutable"];
  const noTransform = h1["no-transform"] || h2["no-transform"];

  return {
    "max-age": maxAge,
    "s-maxage": sMaxAge,
    "stale-while-revalidate": staleWhileRevalidate,
    "stale-if-error": staleIfError,
    "public": pub && !pvt,
    "private": pvt,
    "no-cache": noCache,
    "no-store": noStore,
    "must-revalidate": mustRevalidate,
    "proxy-revalidate": proxyRevalidate,
    "immutable": immutable,
    "no-transform": noTransform,
  };
};

export const defaultHeaders = {
  ["x-powered-by"]: `deco@${meta.version}`,
};

export function setCSPHeaders(
  request: Request,
  response: Response,
): Response {
  if (response.status >= 300) { // headers are immutable when using redirect and errors
    return response;
  }
  const referer = request.headers.get("origin") ??
    request.headers.get("referer");
  const isOnAdmin = referer && isAdmin(referer);
  const localhost =
    "127.0.0.1:* localhost:* http://localhost:* http://127.0.0.1:*";
  response.headers.set(
    "Content-Security-Policy",
    `frame-ancestors 'self' ${landingPageDomain} ${localhost} ${
      adminDomains.join(" ")
    } ${
      referer && isOnAdmin
        ? "https://" + referer.startsWith("http")
          ? new URL(referer).host
          : referer
        : ""
    }`,
  );
  return response;
}

/**
 * Parses the specified @param param from querystring of the given @param url.
 * if the parameter is specified so the payload is parsed by decoding the parameter from base64 and parsing as a Json usin JSON.parse,
 * otherwise all query parameters are used to mount an object using the dot notation format (`a.b=10` generates { a :{ b:10 }}).
 * @param param the parameter name
 * @param url the url to parse
 * @returns the parsed payload
 */
// deno-lint-ignore no-explicit-any
export const bodyFromUrl = (param: string, url: URL): Record<string, any> => {
  const props = url.searchParams.get(param);
  if (!props) {
    const start = {};
    for (const [key, value] of url.searchParams.entries()) {
      buildObj(start, [key.split("."), value]);
    }
    return start;
  }
  // frombase64
  return JSON.parse(decodeURIComponent(atob(props)));
};

export const allowCorsFor = (req?: Request): Record<string, string> =>
  allowCorsForOrigin(req?.headers?.get("origin") ?? "*");

export const allowCorsForOrigin = (
  ...origin: string[]
): Record<string, string> => ({
  "Access-Control-Allow-Origin": origin.join(","),
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, If-None-Match, *",
  "Access-Control-Expose-Headers": "ETag",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "public, max-age=86400",
  "Vary": "origin",
});

export { readFromStream } from "../clients/withManifest.ts";

export const forceHttps = (req: Request) => {
  let httpsReq = req;
  if (req.url.startsWith("http:") && !req.url.includes("localhost")) {
    const url = new URL(req.url);
    url.protocol = "https:";
    httpsReq = new Request(url, req);
  }
  return httpsReq;
};
