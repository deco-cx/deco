import { withInstrumentation } from "./common.ts";

import {
  cachesFs as cachesFileSystem,
  isFileSystemAvailable,
} from "./fileSystem.ts";

import { createTieredCache } from "./tiered.ts";

export const ENABLE_LOADER_CACHE: boolean =
  Deno.env.get("ENABLE_LOADER_CACHE") === "true";
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
  | "FILE_SYSTEM";

const cacheImplByEngine: Record<CacheEngine, CacheStorageOption> = {
  CACHE_API: {
    implementation: globalThis.caches,
    isAvailable: typeof globalThis.caches !== "undefined",
  },
  FILE_SYSTEM: {
    implementation: cachesFileSystem,
    isAvailable: isFileSystemAvailable,
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
