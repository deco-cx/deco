export const DEFAULT_CACHE_CONTROL: CacheControl = {
  public: true,
  "max-age": 604800, // 10s browser cache to avoid BYPASS on cloudflare: https://developers.cloudflare.com/cache/about/default-cache-behavior/#cloudflare-cache-responses
  "immutable": true,
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
    "public": pub && !pvt,
    "private": pvt,
    "no-cache": noCache,
    "no-store": noStore,
    "max-age": maxAge,
    "s-maxage": sMaxAge,
    "stale-while-revalidate": staleWhileRevalidate,
    "stale-if-error": staleIfError,
    "must-revalidate": mustRevalidate,
    "proxy-revalidate": proxyRevalidate,
    "immutable": immutable,
    "no-transform": noTransform,
  };
};
