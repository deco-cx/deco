import { WeakLRUCache } from "https://deno.land/x/weakcache@v1.1.4/index.js";
import merge from "https://esm.sh/lodash-es@4/merge?pin=v99";
import Murmurhash3 from "https://deno.land/x/murmurhash/mod.ts";

type CacheOptions = {
  maxAgeInSeconds: number;
  staleIfErrorMaxAgeInSeconds: number;
  staleMaxAgeInSeconds: number;
};

// type CacheEntry = CacheOptions & {
//   data: any; // TODO: status, headers?
//   lastUpdated: number;
// };

// TODO: Fix typings to accept generics
// type Cache = Record<string, CacheEntry>;

const functionsCache = new WeakLRUCache();

type RunLoaderFunctionResponse = {
  data?: any;
  error?: any;
  status?: number;
  headers?: Headers;
};

const DEFAULT_CACHE_OPTIONS: CacheOptions = {
  maxAgeInSeconds: 60 * 5, // 5 minutes,
  staleMaxAgeInSeconds: 60 * 60 * 5, // 5 hours,
  staleIfErrorMaxAgeInSeconds: 60 * 60 * 24, // 1 day,
};

const mergeDefaultCacheOptions = (
  options: Partial<CacheOptions>,
): CacheOptions => {
  return merge({}, DEFAULT_CACHE_OPTIONS, options);
};

export const getKeyForLoaderFunction = (
  functionKey: string,
  route: string,
  props?: Record<string, any>,
) => {
  console.log({ functionKey, route, props });
  const hash = new Murmurhash3("string");

  hash.hash(functionKey);
  hash.hash(route);

  const getSortedEntriesForObject = (record: Record<string, any>) => {
    const sortedProps = Object.entries(record);
    sortedProps.sort(([a], [z]) => a.localeCompare(z));
    return sortedProps;
  };

  const sortedProps = getSortedEntriesForObject(props ?? {});

  hash.hash(JSON.stringify(sortedProps));

  return hash.result().toString();
};

export const runLoaderFunction = async (
  fn: () => Promise<any>,
  cacheKey: string,
): Promise<RunLoaderFunctionResponse> => {
  console.log(functionsCache);
  const cacheEntry = functionsCache.get(cacheKey);

  const {
    lastUpdated,
    data,
    maxAgeInSeconds,
    staleIfErrorMaxAgeInSeconds,
    staleMaxAgeInSeconds,
  } = cacheEntry ??
    { lastUpdated: 0, maxAgeInMs: 0, staleIfErrorHit: 0, staleMaxAgeInMs: 0 };

  const now = Date.now();

  console.log({ lastUpdated, maxAgeInSeconds, now });
  const isCacheHit = (lastUpdated + maxAgeInSeconds * 1000) > now;

  console.log({ isCacheHit });
  if (isCacheHit) {
    console.log(`Cache hit for ${cacheKey}`);
    return data; // { data: any, status: number, headers: {} }
  }

  const isStaleHit = (lastUpdated + staleMaxAgeInSeconds * 1000) > now;

  const runningFunctionPromise = fn().then(
    (functionResponse) => {
      const cacheOptions = mergeDefaultCacheOptions(functionResponse);

      // console.log({ cacheOptions });

      console.log(`Updating cache value for ${cacheKey}`);
      functionsCache.set(cacheKey, { ...cacheOptions, lastUpdated: now });
      return functionResponse;
    },
  ).catch((e: any) => {
    console.error({
      message: `Function with cache key ${cacheKey} failed`,
      error: e,
    });

    return null;
  });

  if (isStaleHit) {
    console.log(`Stale hit for ${cacheKey}`);
    return data;
  }

  const functionResponse = await runningFunctionPromise;

  const functionErrored = !functionResponse;

  const staleIfErrorHit = (lastUpdated + staleIfErrorMaxAgeInSeconds * 1000) > now;

  if (functionErrored && staleIfErrorHit) {
    console.log(`Stale error hit for ${cacheKey}`);
    return data;
  }

  console.log(`Cache miss for ${cacheKey}`);
  return functionResponse;
};
