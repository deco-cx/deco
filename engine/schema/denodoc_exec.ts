import { exec } from "$live/engine/schema/utils.ts";
import { DocNode } from "https://deno.land/x/deno_doc@0.59.0/lib/types.d.ts";
import { pLimit } from "https://deno.land/x/p_limit@v1.0.0/mod.ts";

const limit = pLimit(5);

const denoDocLocalCache = new Map<string, Promise<DocNode[]>>();

const docAsExec = async (
  path: string,
  _?: string,
): Promise<DocNode[]> => {
  return await limit(async () =>
    JSON.parse(await exec([Deno.execPath(), "doc", "--json", path]))
  ); // FIXME(mcandeia) add --private when stable
};

interface DocCache {
  docNodes: DocNode[];
  lastModified: number;
}
/**
 * Determines whether an error is a QuotaExceededError.
 *
 * Browsers love throwing slightly different variations of QuotaExceededError
 * (this is especially true for old browsers/versions), so we need to check
 * different fields and values to ensure we cover every edge-case.
 *
 * @param err - The error to check
 * @return Is the error a QuotaExceededError?
 */
function isQuotaExceededError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    // everything except Firefox
    (err.code === 22 ||
      // Firefox
      err.code === 1014 ||
      // test name field too, because code might not be present
      // everything except Firefox
      err.name === "QuotaExceededError" ||
      // Firefox
      err.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

export const denoDoc = async (
  path: string,
  _importMap?: string,
): Promise<DocNode[]> => {
  try {
    const isLocal = path.startsWith("file");
    const lastModified = isLocal
      ? await Deno.stat(new URL(path)).then((s) =>
        s.mtime?.getTime() ?? Date.now() // when the platform doesn't support mtime so we should not cache at
      )
      : 0; // remote http modules can be cached forever;
    const current = localStorage.getItem(path);
    if (current) {
      const parsed: DocCache = JSON.parse(current);
      if (parsed.lastModified === lastModified) {
        return parsed.docNodes;
      }
    }
    const promise = denoDocLocalCache.get(path) ?? docAsExec(path);
    promise.then((doc) => {
      try {
        localStorage.setItem(
          path,
          JSON.stringify({ docNodes: doc, lastModified }),
        );
      } catch (err) {
        if (isQuotaExceededError(err)) {
          localStorage.clear();
        }
      }
    });
    denoDocLocalCache.set(path, promise);
    return await promise;
  } catch (err) {
    console.warn("deno doc error, ignoring", err);
    return [];
  }
};
