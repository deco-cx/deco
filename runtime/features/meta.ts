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

export interface MetaInfo {
  major: number;
  namespace: string;
  version: string;
  schema: Schemas;
  manifest: ManifestBlocks;
  site: string;
  platform: string;
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
        const manifestBlocks = toManifestBlocks(
          manifest,
        );
        const schema = await lazySchema.value;
        mschema = schema; // compatibility mode only, it should be deleted when https://github.com/deco-cx/apps/pull/285/files was merged

        const info: MetaInfo = {
          major: parse(denoJSON.version).major,
          version: denoJSON.version,
          namespace: context.namespace!,
          site: context.site!,
          manifest: manifestBlocks,
          schema,
          platform: context.platform,
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
  context: DecoContext,
  opts?: GetMetaOpts,
): Promise<VersionedMetaInfo | undefined> => {
  const ctrl = new AbortController();
  const signal = opts?.signal;
  if (signal) {
    signal.onabort = () => ctrl.abort();
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
