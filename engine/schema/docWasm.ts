/// <reference lib="deno.unstable" />

import { doc, LoadResponse } from "$live/utils/deno_doc_wasm/mod.ts";
import { DocNode } from "$live/utils/deno_doc_wasm/types.d.ts";
import { join } from "std/path/mod.ts";

import { singleFlight } from "$live/engine/core/utils.ts";
import { pLimit } from "https://deno.land/x/p_limit@v1.0.0/mod.ts";
import { crypto, toHashString } from "std/crypto/mod.ts";
import { context } from "$live/live.ts";

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
const kv = await Deno.openKv?.().catch((e) => {
  console.error(e);

  return null;
});

const docCache: Record<string, Promise<DocNode[]>> = {};

const sf = singleFlight<DocNode[]>();
// layers of cache
// ["deploymentId", "path"]
// ["path", "md5"]
export const denoDoc = (
  path: string,
  importMap?: string,
): Promise<DocNode[]> => {
  const pathResolved = import.meta.resolve(path);
  return sf.do(pathResolved, async () => {
    if (docCache[pathResolved] !== undefined) {
      return docCache[pathResolved];
    }
    if (!kv) {
      return docCache[pathResolved] ??= docAsLib(path);
    }
    loadCache[pathResolved] ??= load(pathResolved);
    const byPathKey = [
      "denodocs",
      context.deploymentId!,
      pathResolved,
    ];
    const docs = await kv.get<DocNode[]>(byPathKey);
    if (docs.value !== null) {
      docCache[pathResolved] = Promise.resolve(docs.value);
      return docCache[pathResolved];
    }
    const module = await loadCache[pathResolved];
    const content = (module as { content: string })?.content;
    if (!content) {
      return [];
    }
    const moduleMd5 = await crypto.subtle.digest(
      "MD5",
      new TextEncoder().encode(content),
    ).then(toHashString);

    const byMd5Key = [
      "denodocs",
      pathResolved,
      moduleMd5,
    ];
    const byMD5Content = await kv.get<DocNode[]>(byMd5Key);

    if (byMD5Content.value) {
      docCache[pathResolved] = Promise.resolve(byMD5Content.value);
      return docCache[pathResolved];
    }
    return docCache[pathResolved] ??= docAsLib(path, importMap).then((doc) => {
      kv.atomic().set(byPathKey, doc).set(byMd5Key, doc).commit();
      return doc;
    });
  }).catch((e) => {
    console.log(`denodoc ${pathResolved} error igonoring`, e);
    return [];
  });
};
