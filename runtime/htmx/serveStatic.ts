// @author Marcos V. Candeia
//
// this implementation was heavily inspired by fresh's https://github.com/denoland/fresh/blob/bd16a65587998482dac8d70bd82e3e210d345563/src/middlewares/static_files.ts
//
import { contentType as getContentType } from "jsr:@std/media-types@^1.0.0-rc.1/content-type";
import { encodeHex } from "std/encoding/hex.ts";
import { extname } from "std/path/mod.ts";
import { context } from "../../deco.ts";
import type { MiddlewareHandler } from "../deps.ts";
import { getFileFromCache, initializeFileCache } from "./fileCache.ts";

export const ASSET_CACHE_BUST_KEY = "__deco_c"; // Example cache bust key
export const FRSH_ASSET_CACHE_BUST_KEY = "__frsh_c";

const deploymentId = context.deploymentId ||
  // For CI
  Deno.env.get("GITHUB_SHA") ||
  crypto.randomUUID();
const buildIdHash = await crypto.subtle.digest(
  "SHA-1",
  new TextEncoder().encode(deploymentId),
);

// this function was copied from fresh asset implementation
// original: https://github.com/denoland/fresh/blob/bd16a65587998482dac8d70bd82e3e210d345563/src/runtime/shared_internal.tsx#L64
export function asset(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  try {
    const url = new URL(path, "https://assetcache.local");
    if (
      url.protocol !== "https:" || url.host !== "assetcache.local" ||
      (url.searchParams.has(ASSET_CACHE_BUST_KEY) ||
        url.searchParams.has(FRSH_ASSET_CACHE_BUST_KEY))
    ) {
      return path;
    }
    url.searchParams.set(ASSET_CACHE_BUST_KEY, BUILD_ID);
    return url.pathname + url.search + url.hash;
  } catch (err) {
    console.warn(
      `Failed to create asset() URL, falling back to regular path ('${path}'):`,
      err,
    );
    return path;
  }
}

export const BUILD_ID = encodeHex(buildIdHash);

export function staticFiles(root: string = "static/"): MiddlewareHandler {
  // Initialize the file cache at application startup
  const fileCacheInit = initializeFileCache(root).catch(console.error);
  return async (c, next) => {
    await fileCacheInit;
    const req = c.req;
    const url = new URL(req.url);
    const pathname = url.pathname;

    const file = getFileFromCache(pathname);
    if (pathname === "/" || file === null) {
      if (pathname === "/favicon.ico") {
        return c.notFound();
      }
      await next();
      return;
    }
    if (!file) {
      await next();
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      return c.text("Method Not Allowed", 405);
    }

    const cacheKey = url.searchParams.get(ASSET_CACHE_BUST_KEY);
    if (cacheKey !== null && BUILD_ID !== cacheKey) {
      url.searchParams.delete(ASSET_CACHE_BUST_KEY);
      const location = url.pathname + url.search;
      return c.redirect(location, 307);
    }

    const ext = extname(pathname);
    const etag = file?.etag;
    const contentType = getContentType(ext) || "text/plain";
    const headers = new Headers({
      "Content-Type": contentType,
      "Vary": "If-None-Match",
    });

    if (cacheKey === null) {
      headers.append(
        "Cache-Control",
        "no-cache, no-store, max-age=0, must-revalidate",
      );
    } else {
      const ifNoneMatch = req.raw.headers.get("If-None-Match");
      if (
        ifNoneMatch &&
        (ifNoneMatch === etag || ifNoneMatch === `W/"${etag}"`)
      ) {
        return c.res = new Response(null, { status: 304, headers });
      }
      headers.set("Etag", `W/"${etag}"`);
    }

    headers.set("Content-Length", String(file?.size));
    if (req.method === "HEAD") {
      return c.res = new Response(null, { status: 200, headers });
    }
    headers.append("Cache-Control", "public, max-age=31536000, immutable");

    return c.res = new Response(file.data, { status: 200, headers });
  };
}
