import { withInstrumentation } from "./common.ts";
import { caches as cachesKV } from "./denoKV.ts";
import { caches as cachesProxy } from "./proxy.ts";
import { caches as redisCache, redis } from "./redis.ts";
import { caches as cachesFileSystem } from "./fileSystem.ts";
import { caches as cachesS3 } from "./s3.ts";
import { createTieredCache } from "./tiered.ts";

const ENABLE_LOADER_CACHE = Deno.env.get("ENABLE_LOADER_CACHE") === "true";
const DEFAULT_CACHE_ENGINE = ENABLE_LOADER_CACHE ? "KV" : "CF_PROXY";
const WEB_CACHE_ENGINES: CacheEngine[] = Deno.env.has("WEB_CACHE_ENGINE")
  ? Deno.env.get("WEB_CACHE_ENGINE")!.split(",") as CacheEngine[]
  : DEFAULT_CACHE_ENGINE.split(",") as CacheEngine[];

const FILE_SYSTEM_CACHE_DIRECTORY =
  Deno.env.get("FILE_SYSTEM_CACHE_DIRECTORY") ?? undefined;

const bucketName = Deno.env.get("CACHE_UPLOAD_BUCKET");
const awsRegion = Deno.env.get("CACHE_AWS_REGION");
const awsAccessKeyId = Deno.env.get("CACHE_AWS_ACCESS_KEY_ID")!;
const awsSecretAccessKey = Deno.env.get("CACHE_AWS_SECRET_ACCESS_KEY")!;
const awsEndpoint = Deno.env.get("CACHE_AWS_ENDPOINT");

const hasWritePerm = async (): Promise<boolean> => {
  return await Deno.permissions.query(
    { name: "write", path: FILE_SYSTEM_CACHE_DIRECTORY } as const,
  ).then((status) => status.state === "granted");
};

const isFileSystemAvailable = await hasWritePerm() &&
  FILE_SYSTEM_CACHE_DIRECTORY !== undefined;

const isEndpointSet = (bucketName !== undefined && awsRegion !== undefined) ||
  awsEndpoint !== undefined;
const areCredentialsSet = awsAccessKeyId !== undefined &&
  awsSecretAccessKey !== undefined;
const isS3Available = isEndpointSet && areCredentialsSet;

export interface CacheStorageOption {
  implementation: CacheStorage;
  isAvailable: boolean;
}

export type CacheEngine =
  | "REDIS"
  | "KV"
  | "CACHE_API"
  | "CF_PROXY"
  | "FILE_SYSTEM"
  | "S3";
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
  FILE_SYSTEM: {
    implementation: cachesFileSystem,
    isAvailable: isFileSystemAvailable,
  },
  S3: {
    implementation: cachesS3,
    isAvailable: isS3Available,
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
  return createTieredCache(...eligibleCacheImplementations);
};

export const caches = getCacheStorage();
