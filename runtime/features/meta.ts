import { parse } from "@std/semver";
import { Context, type DecoContext } from "../../deco.ts";
import denoJSON from "../../deno.json" with { type: "json" };
import { singleFlight } from "../../engine/core/utils.ts";
import type { Schemas } from "../../engine/schema/builder.ts";
import { namespaceOf } from "../../engine/schema/gen.ts";
import { type LazySchema, lazySchemaFor } from "../../engine/schema/lazy.ts";
import { schemaVersion } from "../../engine/schema/parser.ts";
import type { AppManifest } from "../../types.ts";

type BlockMap = Record<string, { $ref: string; namespace: string }>;
interface ManifestBlocks {
  blocks: Record<string, BlockMap>;
}

export interface FolderMeta {
  description?: string;
  icon?: string;
}

export type FolderMetaMap = Record<string, Record<string, FolderMeta>>;

export interface MetaInfo {
  major: number;
  namespace: string;
  version: string;
  schema: Schemas;
  manifest: ManifestBlocks;
  folderMeta?: FolderMetaMap;
  site: string;
  platform: string;
  cloudProvider: string;
}

const toManifestBlocks = (
  decoManifest: AppManifest & {
    routes?: unknown;
    islands?: unknown;
  },
): ManifestBlocks => {
  const {
    baseUrl: _ignoreBaseUrl,
    routes: _ignoreRoutes,
    islands: _ignoreIslands,
    name: _ignoreName,
    ...blocks
  } = decoManifest;
  const manBlocks: Record<string, BlockMap> = {};
  for (const [blkType, blkValues] of Object.entries(blocks)) {
    for (const blkKey of Object.keys(blkValues)) {
      manBlocks[blkType] ??= {};
      manBlocks[blkType][blkKey] = {
        $ref: `#/definitions/${btoa(blkKey)}`,
        namespace: namespaceOf(blkType, blkKey).replace(
          ".",
          Context.active().namespace!,
        ),
      };
    }
  }
  return { blocks: manBlocks };
};

/**
 * Reads _folder.json files for folder metadata.
 * Returns a map of blockType -> folderName -> FolderMeta
 */
const readFolderMeta = async (
  manifestBlocks: ManifestBlocks,
): Promise<FolderMetaMap> => {
  const folderMeta: FolderMetaMap = {};

  for (const [blockType, blocks] of Object.entries(manifestBlocks.blocks)) {
    // Map of folder name -> full folder path (e.g., "AIPartner" -> "site/sections/AIPartner")
    const folderPaths = new Map<string, string>();

    // Extract folder names and their full paths from block paths
    for (const blockKey of Object.keys(blocks)) {
      // blockKey looks like: site/sections/AIPartner/Hero.tsx
      const parts = blockKey.split("/");
      const blockTypeIndex = parts.indexOf(blockType);
      if (blockTypeIndex !== -1 && parts.length > blockTypeIndex + 2) {
        // There's a folder between blockType and the file
        const folderName = parts[blockTypeIndex + 1];
        // Store the full path from start up to and including the folder
        const fullFolderPath = parts.slice(0, blockTypeIndex + 2).join("/");
        folderPaths.set(folderName, fullFolderPath);
      }
    }

    // Read _folder.json for each folder in parallel
    const readResults = await Promise.allSettled(
      Array.from(folderPaths.entries()).map(
        async ([folderName, fullFolderPath]) => {
          const filePath = `./${fullFolderPath}/_folder.json`;
          const content = await Deno.readTextFile(filePath);
          const meta = JSON.parse(content) as FolderMeta;
          return { folderName, meta };
        },
      ),
    );

    for (const result of readResults) {
      if (result.status === "fulfilled") {
        const { folderName, meta } = result.value;
        if (meta.description || meta.icon) {
          folderMeta[blockType] ??= {};
          folderMeta[blockType][folderName] = meta;
        }
      }
      // Silently ignore rejected promises (file not found, parse errors, etc.)
      // If we want to surface parse errors, we could check result.reason here
    }
  }

  return folderMeta;
};

export let mschema: Schemas | null = null; // compatibility mode only, it should be deleted when https://github.com/deco-cx/apps/pull/285/files was merged

const sf = singleFlight<MetaInfo>();

const etagFor = async (lazySchema: LazySchema) =>
  `${await lazySchema.revision}@${schemaVersion}`;

const waitForChanges = async (ifNoneMatch: string, signal: AbortSignal) => {
  while (!signal.aborted) {
    const context = Context.active();
    const lazySchema = lazySchemaFor(context);

    const etag = await etagFor(lazySchema);

    if (etag !== ifNoneMatch) {
      const info = await sf.do(context.instance.id, async () => {
        const { manifest } = await context.runtime!;
        const manifestBlocks = toManifestBlocks(manifest);
        const schema = await lazySchema.value;

        mschema = schema; // compatibility mode only, it should be deleted when https://github.com/deco-cx/apps/pull/285/files was merged

        // Read folder metadata from _folder.json files
        const folderMeta = await readFolderMeta(manifestBlocks);

        const info: MetaInfo = {
          major: parse(denoJSON.version).major,
          version: denoJSON.version,
          namespace: context.namespace!,
          site: context.site!,
          manifest: manifestBlocks,
          folderMeta: Object.keys(folderMeta).length > 0
            ? folderMeta
            : undefined,
          schema,
          platform: context.platform,
          cloudProvider: Deno.env.get("CLOUD_PROVIDER") ?? "unknown",
        };

        return info;
      });

      return { etag, value: info };
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }
};

export interface GetMetaOpts {
  signal?: AbortSignal;
  ifNoneMatch: string;
}

export interface VersionedMetaInfo {
  value: MetaInfo;
  etag: string;
}

export const meta = async (
  _context: DecoContext,
  opts?: GetMetaOpts,
): Promise<VersionedMetaInfo | undefined> => {
  const ctrl = new AbortController();
  const signal = opts?.signal;
  if (signal) {
    signal.onabort = () => ctrl.abort();
  }
  let context = Context.active();
  if (Context.isDefault()) {
    context = _context;
  }
  setTimeout(() => ctrl.abort(), 20 * 60 * 1e3); // 20 minutes in ms
  const lazySchema = lazySchemaFor(context);
  const schemaEtag = await etagFor(lazySchema);
  const etag =
    signal && opts?.ifNoneMatch && (opts.ifNoneMatch === schemaEtag ||
        opts.ifNoneMatch === `W/${schemaEtag}`)
      ? schemaEtag
      : "";
  return await waitForChanges(
    etag,
    ctrl.signal,
  );
};
