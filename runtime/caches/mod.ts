import { withInstrumentation } from "./common.ts";
import { compose } from "./compose.ts";
import { caches as cachesKV } from "./denoKV.ts";
import { caches as cachesProxy } from "./proxy.ts";
import { caches as redisCache, redis } from "./redis.ts";

const DEFAULT_CACHE_ENGINE: CacheEngine = "CF_PROXY";
const WEB_CACHE_ENGINES: CacheEngine[] = Deno.env.has("WEB_CACHE_ENGINE")
  ? Deno.env.get("WEB_CACHE_ENGINE")!.split(",") as CacheEngine[]
  : [DEFAULT_CACHE_ENGINE];

export interface CacheStorageOption {
  implementation: CacheStorage;
  isAvailable: boolean;
}

export type CacheEngine = "REDIS" | "KV" | "CACHE_API" | "CF_PROXY";
const cacheImplByEngine: Record<CacheEngine, CacheStorageOption> = {
  REDIS: {
    implementation: redisCache,
    isAvailable: redis !== null,
  },
  KV: {
    implementation: cachesKV,
    isAvailable: typeof Deno.openKv === "function",
  },
  CACHE_API: {
    implementation: globalThis.caches,
    isAvailable: typeof globalThis.caches !== "undefined",
  },
  CF_PROXY: {
    implementation: cachesProxy,
    isAvailable: true,
  },
};

for (const [engine, cache] of Object.entries(cacheImplByEngine)) {
  cacheImplByEngine[engine as CacheEngine] = {
    ...cache,
    implementation: withInstrumentation(cache.implementation, engine),
  };
}

const eligibleCacheImplementations = WEB_CACHE_ENGINES.map((engine) =>
  cacheImplByEngine[engine]
).filter((engine) => engine.isAvailable).map((engine) => engine.implementation);

const getCacheStorage = (): CacheStorage => {
  if (eligibleCacheImplementations.length === 0) {
    return cacheImplByEngine[DEFAULT_CACHE_ENGINE].implementation;
  }
  return compose(...eligibleCacheImplementations);
};

export const caches = getCacheStorage();
