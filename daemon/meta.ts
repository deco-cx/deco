import type { BlockType } from "../engine/block.ts";
import type { JSONSchema } from "../types.ts";
import { broadcast } from "./sse/channel.ts";
import { dispatchWorkerState, worker } from "./worker.ts";

export type BlockMap = Record<string, { $ref: string; namespace: string }>;

export interface ManifestBlocks {
  blocks: Record<string, BlockMap>;
}

export interface MetaInfo {
  major: number;
  namespace: string;
  version: string;
  schema: {
    definitions: Record<string, JSONSchema>;
    root: Record<string, JSONSchema>;
  };
  manifest: ManifestBlocks;
  site: string;
  etag?: string;
  timestamp: number;
}

type Meta = MetaInfo | null;

export type MetaEvent = {
  type: "meta-info";
  detail: Meta;
};

let meta: PromiseWithResolvers<Meta> | Meta = Promise
  .withResolvers<Meta>();
/** Map (filename, blockType) */
let filenameBlockTypeMap: Record<string, BlockType> = {};

const metaRequest = (etag: string) =>
  new Request(`http://0.0.0.0/deco/meta?waitForChanges=true`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "If-None-Match": etag,
    },
  });

const isPromiseLike = <T>(
  x: T | PromiseWithResolvers<T>,
): x is PromiseWithResolvers<T> =>
  // @ts-expect-error typescript is wild
  !!x && typeof x.resolve === "function" && typeof x.reject === "function";

export const start = async (since: number): Promise<MetaEvent | null> => {
  const detail = await ensureMetaIsReady();

  if (!detail || since >= detail.timestamp) {
    return null;
  }

  return {
    type: "meta-info",
    detail,
  };
};

/** Ensures meta is resolved and return. */
export const ensureMetaIsReady = async (): Promise<MetaInfo | null> =>
  isPromiseLike(meta) ? await meta.promise : meta;

export const watchMeta = async () => {
  let etag = "";

  const setMeta = (
    m: MetaInfo | null,
  ) => {
    if (meta && isPromiseLike(meta)) {
      meta.resolve(m);
    }
    meta = m;
  };

  while (true) {
    try {
      const w = await worker();
      const response = await w.fetch(metaRequest(etag));
      if (!response.ok) {
        throw response;
      }
      const m: MetaInfo = await response.json();

      etag = response.headers.get("etag") ?? etag;
      const withExtraParams = { ...m, etag, timestamp: Date.now() };

      filenameBlockTypeMap = updateFilenameBlockTypeMapFromManifest(m.manifest);

      setMeta(withExtraParams);

      broadcast({ type: "meta-info", detail: withExtraParams });
      dispatchWorkerState("ready");
    } catch (error) {
      // in case of timeout, retry without updating the worker state
      // to avoid false alarming down state
      if (error.status === 408) {
        continue;
      }

      if (error.status === 404) {
        setMeta(null);
        broadcast({ type: "meta-info", detail: null });
        dispatchWorkerState("ready");
        return;
      }

      dispatchWorkerState("updating");
      console.error(error);
    }
  }
};

/** Update filenameBlockTypeMap from manifest */
const updateFilenameBlockTypeMapFromManifest = (
  manifest: ManifestBlocks,
): Record<string, string> => {
  const newFilenameBlockTypeMap: Record<string, string> = {};
  for (const blockType in manifest.blocks) {
    const blocksByBlockType = manifest.blocks[blockType];
    for (const filename in blocksByBlockType) {
      newFilenameBlockTypeMap[filename] = blockType;
    }
  }
  return newFilenameBlockTypeMap;
};

/** Given a filename returns a blocktype */
export const inferBlockType = async (filename: string): Promise<string> => {
  await ensureMetaIsReady();
  return filenameBlockTypeMap[filename];
};
