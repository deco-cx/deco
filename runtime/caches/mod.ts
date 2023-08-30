import { caches as cachesKV } from "./denoKV.ts";
import { caches as cachesProxy } from "./proxy.ts";

const WEB_CACHE_ENGINE = Deno.env.get("WEB_CACHE_ENGINE");

const getCacheStorage = (): CacheStorage => {
  if (typeof Deno.openKv === "function" && WEB_CACHE_ENGINE === "KV") {
    console.log("Returning KV cache");
    return cachesKV;
  }

  if (typeof globalThis.caches !== "undefined") {
    console.log("Returning global Cache");
    return globalThis.caches;
  }

  console.log("Returning cache proxy");
  return cachesProxy;
};

export const caches = getCacheStorage();
