import { caches as cachesKV } from "./denoKV.ts";
import { caches as cachesProxy } from "./proxy.ts";

const WEB_CACHE_ENGINE = Deno.env.get("WEB_CACHE_ENGINE");

const getCacheStorage = (): CacheStorage => {
  if (typeof Deno.openKv === "function" && WEB_CACHE_ENGINE === "KV") {
    return cachesKV;
  }

  if (typeof globalThis.caches !== "undefined" && WEB_CACHE_ENGINE === "CACHE_API") {
    return globalThis.caches;
  }

  return cachesProxy;
};

export const caches = getCacheStorage();
