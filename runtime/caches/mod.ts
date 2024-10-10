import { withInstrumentation } from "./common.ts";

import { isFileSystemAvailable } from "./fileSystem.ts";

import { caches as headersCache } from "./headerscache.ts";

import {
  caches as redisCache,
  isAvailable as isRedisCacheAvailable,
} from "./redis.ts";

import { createTieredCache } from "./tiered.ts";

import { caches as lruCache } from "./lrucache.ts";

import { caches as fileSystem } from "./fileSystem.ts";

export const ENABLE_LOADER_CACHE: boolean =
  Deno.env.get("ENABLE_LOADER_CACHE") !== "false";
const DEFAULT_CACHE_ENGINE = "CACHE_API";
const WEB_CACHE_ENGINES: CacheEngine[] = Deno.env.has("WEB_CACHE_ENGINE")
  ? Deno.env.get("WEB_CACHE_ENGINE")!.split(",") as CacheEngine[]
  : [DEFAULT_CACHE_ENGINE];

export interface CacheStorageOption {
  implementation: CacheStorage;
  isAvailable: boolean;
}

export type CacheEngine =
  | "CACHE_API"
  | "REDIS"
  | "FILE_SYSTEM";

export const cacheImplByEngine: Record<CacheEngine, CacheStorageOption> = {
  CACHE_API: {
    implementation: headersCache(globalThis.caches),
    isAvailable: typeof globalThis.caches !== "undefined",
  },
  FILE_SYSTEM: {
    implementation: headersCache(lruCache(fileSystem)),
    isAvailable: isFileSystemAvailable,
  },
  REDIS: {
    implementation: redisCache,
    isAvailable: isRedisCacheAvailable,
  },
};

for (const [engine, cache] of Object.entries(cacheImplByEngine)) {
  cacheImplByEngine[engine as CacheEngine] = {
    ...cache,
    implementation: withInstrumentation(cache.implementation, engine),
  };
}

const eligibleCacheImplementations = WEB_CACHE_ENGINES
  .map((engine) => cacheImplByEngine[engine])
  .filter((engine) => engine?.isAvailable)
  .map((engine) => engine.implementation);

const getCacheStorage = (): CacheStorage | undefined => {
  if (eligibleCacheImplementations.length === 0) {
    return cacheImplByEngine[DEFAULT_CACHE_ENGINE].implementation;
  }

  return createTieredCache(...eligibleCacheImplementations);
};

export const caches = getCacheStorage();
