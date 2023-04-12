import { HandlerContext } from "$fresh/server.ts";
import { Schemas } from "$live/engine/schema/builder.ts";
import { getCurrent } from "$live/engine/schema/reader.ts";
import { context } from "$live/live.ts";
import meta from "$live/meta.json" assert { type: "json" };
import { DecoManifest } from "$live/types.ts";
import { namespaceOf } from "$live/engine/schema/gen.ts";
import { major } from "std/semver/mod.ts";

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
}

export const toManifestBlocks = (
  decoManifest: DecoManifest,
): ManifestBlocks => {
  const {
    baseUrl: _ignoreBaseUrl,
    config: _ignoreConfig,
    routes: _ignoreRoutes,
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
          context.namespace!,
        ),
      };
    }
  }
  return { blocks: manBlocks };
};

export const handler = async (req: Request, __: HandlerContext) => {
  const schema = await getCurrent();
  const info: MetaInfo = {
    major: major(meta.version),
    version: meta.version,
    namespace: context.namespace!,
    site: context.site!,
    manifest: toManifestBlocks(context.manifest!),
    schema,
  };
  return new Response(
    JSON.stringify(info),
    {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": req.headers.get("origin") || "*",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, *",
      },
    },
  );
};
