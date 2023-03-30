import { HandlerContext } from "$fresh/server.ts";
import { Schemas } from "$live/engine/schema/builder.ts";
import { getCurrent } from "$live/engine/schema/reader.ts";
import { context } from "$live/live.ts";
import meta from "$live/meta.json" assert { type: "json" };
import { DecoManifest } from "$live/types.ts";

type BlockMap = Record<string, { $ref: string }>;
interface ManifestBlocks {
  blocks: Record<string, BlockMap>;
}

export interface MetaInfo {
  namespace: string;
  version: string;
  schema: Schemas;
  manifest: ManifestBlocks;
  site: string;
}

const toManifestBlocks = (decoManifest: DecoManifest): ManifestBlocks => {
  const {
    baseUrl: _ignoreBaseUrl,
    config: _ignoreConfig,
    routes: _ignoreRoutes,
    ...blocks
  } = decoManifest;
  const manBlocks: Record<string, BlockMap> = {};
  for (const [blkKey, blkValues] of Object.entries(blocks)) {
    for (const blkValueKey of Object.keys(blkValues)) {
      manBlocks[blkKey] ??= {};
      manBlocks[blkKey][blkValueKey] = {
        $ref: `#/definitions/${btoa(blkValueKey)}`,
      };
    }
  }
  return { blocks: manBlocks };
};

export const handler = async (req: Request, __: HandlerContext) => {
  const schema = await getCurrent();
  const info: MetaInfo = {
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
