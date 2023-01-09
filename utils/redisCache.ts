import { connect, Redis } from "https://deno.land/x/redis@v0.29.0/mod.ts";
import { WeakLRUCache } from "https://deno.land/x/weakcache@v1.1.4/index.js";

const fallbackCache = new WeakLRUCache();

class RedisCache {
  redisPromise: Promise<Redis | void>;
  redis: Redis;
  isResolved = true;
  constructor() {
    this.redisPromise = Promise.resolve();
    this.redis = null as unknown as Redis;
    this.#connect();
  }

  #connect = () => {
    if (this.isResolved && (this.redis === null || this.redis.isClosed)) {
      this.isResolved = false;
      this.redisPromise = connect({
        hostname: "127.0.0.1",
        port: 6379,
      }).then((e) => {
        this.redis = e;
      }).catch((e) => {
        console.log(e)
      }).finally(() => {
        this.isResolved = true;
      });
    }
  };

  get = async (cacheKey: string) => {
    if (this.redis?.isConnected) {
      const response = await this.redis.get(cacheKey).catch((e) =>
        console.log(e)
      );
      return response ? JSON.parse(response) : null;
    } else {
      this.#connect();
      return fallbackCache.get(cacheKey);
    }
  };

  set = async (cacheKey: string, cacheEntry: any) => {
    if (this.redis?.isConnected) {
      const expire = cacheEntry?.maxAgeInSeconds ?? 60 * 5;
      const ok = await this.redis.set(
        cacheKey,
        JSON.stringify(cacheEntry),
        { "ex": expire },
      ).catch((e) => console.log(e));
      return ok;
    } else {
      this.#connect();
      return fallbackCache.set(cacheKey, cacheEntry);
    }
  };
}

export default new RedisCache();
