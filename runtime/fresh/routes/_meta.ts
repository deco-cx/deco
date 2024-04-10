import { parse } from "std/semver/mod.ts";
import { Context } from "../../../deco.ts";
import { singleFlight } from "../../../engine/core/utils.ts";
import { Schemas } from "../../../engine/schema/builder.ts";
import { namespaceOf } from "../../../engine/schema/gen.ts";
import { type LazySchema, lazySchemaFor } from "../../../engine/schema/lazy.ts";
import meta from "../../../meta.json" with { type: "json" };
import { AppManifest } from "../../../types.ts";
import { allowCorsFor } from "../../../utils/http.ts";

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

export const toManifestBlocks = (
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

const sf = singleFlight<string>();
const binaryId = Context.active().deploymentId ?? crypto.randomUUID();

const etagFor = async (lazySchema: LazySchema) =>
  `${await lazySchema.revision}@${binaryId}`;

const waitForChanges = async (ifNoneMatch: string) => {
  while (true) {
    const context = Context.active();
    const lazySchema = lazySchemaFor(context);
    const etag = await etagFor(lazySchema);

    if (etag !== ifNoneMatch) {
      const info = await sf.do(context.instance.id, async () => {
        const { manifest } = await context.runtime!;
        const manfiestBlocks = toManifestBlocks(
          manifest,
        );
        const schema = await lazySchema.value;
        mschema = schema; // compatibility mode only, it should be deleted when https://github.com/deco-cx/apps/pull/285/files was merged

        const info: MetaInfo = {
          major: parse(meta.version).major,
          version: meta.version,
          namespace: context.namespace!,
          site: context.site!,
          manifest: manfiestBlocks,
          schema,
          platform: context.platform,
        };

        return JSON.stringify(info);
      });

      return { etag, info };
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }
};

export const handler = async (req: Request) => {
  const url = new URL(req.url);

  const context = Context.active();
  const lazySchema = lazySchemaFor(context);
  const { info, etag } = await waitForChanges(
    url.searchParams.get("waitForChanges") === "true"
      ? await etagFor(lazySchema)
      : "",
  );

  console.log({ waitForChanges: url.searchParams.get("waitForChanges") });

  return new Response(info, {
    headers: {
      "Content-Type": "application/json",
      "cache-control": "must-revalidate",
      etag,
      ...allowCorsFor(req),
    },
  });
};
