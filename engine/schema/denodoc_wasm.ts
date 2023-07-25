/// <reference lib="deno.unstable" />

import { doc, LoadResponse } from "$live/utils/deno_doc_wasm/mod.ts";
import { DocNode } from "$live/utils/deno_doc_wasm/types.d.ts";
import { join } from "std/path/mod.ts";

import { singleFlight } from "$live/engine/core/utils.ts";
import { pLimit } from "https://deno.land/x/p_limit@v1.0.0/mod.ts";
import { crypto, toHashString } from "std/crypto/mod.ts";

const limit = pLimit(1);

export async function load(
  specifier: string,
): Promise<LoadResponse | undefined> {
  const url = new URL(specifier);
  try {
    switch (url.protocol) {
      case "file:": {
        const content = await Deno.readTextFile(url);
        return {
          kind: "module",
          specifier,
          content,
        };
      }
      case "http:":
      case "https:": {
        const response = await fetch(String(url), { redirect: "follow" });
        if (response.status !== 200) {
          // ensure the body is read as to not leak resources
          await response.arrayBuffer();
          return undefined;
        }
        const content = await response.text();
        const headers: Record<string, string> = {};
        for (const [key, value] of response.headers) {
          headers[key.toLowerCase()] = value;
        }
        return {
          kind: "module",
          specifier: response.url,
          headers,
          content,
        };
      }
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}

const loadCache: Record<string, Promise<LoadResponse | undefined>> = {};
export const docAsLib = (
  path: string,
  importMap?: string,
): Promise<DocNode[]> => {
  return doc(path, {
    importMap: importMap ?? join("file://", Deno.cwd(), "import_map.json"),
    load: (specifier) => {
      if (loadCache[specifier] !== undefined) {
        return loadCache[specifier];
      }
      return limit(() => loadCache[specifier] ??= load(specifier));
    },
  });
};
// @ts-ignore as `Deno.openKv` is still unstable.
const kvPromise = Deno.openKv?.().catch((e) => {
  console.error(e);

  return null;
});

interface DocCache {
  content: DocNode[];
}

const hashCache: Record<string, Promise<string | undefined>> = {};
const docCache: Record<string, Promise<DocNode[]>> = {};
const getKvCache: Record<string, Promise<Deno.KvEntryMaybe<DocCache>>> = {};

const sf = singleFlight<DocNode[]>();
export const denoDoc = (
  path: string,
  importMap?: string,
): Promise<DocNode[]> => {
  const pathResolved = import.meta.resolve(path);
  return sf.do(pathResolved, async () => {
    const start = performance.now();
    try {
      loadCache[pathResolved] ??= load(pathResolved);
      hashCache[pathResolved] ??= loadCache[pathResolved].then((resolved) => {
        if (typeof resolved === "undefined") {
          return undefined;
        }
        const content = (resolved as { content: string })?.content;
        if (!content) {
          return undefined;
        }
        return crypto.subtle.digest(
          "MD5",
          new TextEncoder().encode(content),
        ).then(toHashString);
      });
      const start1 = performance.now();
      const [hash, kv] = await Promise.all([
        hashCache[pathResolved],
        kvPromise,
      ]);
      console.log("hash and kv took", performance.now() - start1);
      if (kv === null || hash === undefined || kv === undefined) {
        return docCache[pathResolved] ??= docAsLib(path, importMap);
      }
      getKvCache[pathResolved] ??= kv.get<DocCache>([
        "denodoc",
        pathResolved,
        hash,
      ]);
      const start2 = performance.now();
      const cacheEntry = await getKvCache[pathResolved];
      console.log("get kv entry took", performance.now() - start2);

      if (cacheEntry?.value?.content) {
        console.log("hit");
        return cacheEntry.value.content;
      }

      console.log("miss", pathResolved);
      docCache[pathResolved] ??= docAsLib(path).then(
        async (content) => {
          await kv.set(["denodoc", pathResolved, hash], { content }).catch(
            (_err) => {
              console.log("err set", _err);
              null;
            },
          );
          return content;
        },
      );

      const start3 = performance.now();
      const resp = await docCache[pathResolved];
      console.log("deno doc took", performance.now() - start3);
      return resp;
    } catch (err) {
      console.warn("deno doc error, ignoring", err);
      return [];
    } finally {
      console.log("deno doc took", performance.now() - start, path);
    }
  });
};
