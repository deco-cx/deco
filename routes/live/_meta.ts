import { HandlerContext } from "$fresh/server.ts";
import { Release } from "deco/engine/releases/provider.ts";
import { parse } from "std/semver/mod.ts";
import { JSONSchema7 } from "../../deps.ts";
import { Resolvable } from "../../engine/core/resolver.ts";
import { notUndefined, singleFlight } from "../../engine/core/utils.ts";
import { Schemas } from "../../engine/schema/builder.ts";
import { namespaceOf } from "../../engine/schema/gen.ts";
import { genSchemas } from "../../engine/schema/reader.ts";
import { context } from "../../live.ts";
import meta from "../../meta.json" assert { type: "json" };
import { AppManifest, DecoSiteState, DecoState } from "../../types.ts";
import { resolvable } from "../../utils/admin.ts";
import { allowCorsFor } from "../../utils/http.ts";

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
  decoManifest: AppManifest & {
    routes?: unknown;
  },
): ManifestBlocks => {
  const {
    baseUrl: _ignoreBaseUrl,
    routes: _ignoreRoutes,
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
          context.namespace!,
        ),
      };
    }
  }
  return { blocks: manBlocks };
};

export let mschema: Schemas | null = null;
let latestRevision: string | null = null;
const getResolveType = (schema: unknown): string | undefined => {
  const asJsonSchema = schema as JSONSchema7;
  if (
    asJsonSchema?.required && asJsonSchema?.required.length === 1 &&
    asJsonSchema?.properties?.["__resolveType"]
  ) {
    return (asJsonSchema?.properties?.["__resolveType"] as
      | JSONSchema7
      | undefined)?.default as string;
  }
  return undefined;
};
const buildSchemaWithResolvables = (
  manifestBlocks: ManifestBlocks,
  schema: Schemas,
  release: Record<string, Resolvable>,
) => {
  const { loaders, functions, flags, ...currentRoot } = schema.root;
  const root: Record<string, JSONSchema7> = { loaders, functions, flags };
  for (const [ref, val] of Object.entries(currentRoot)) {
    root[ref] = { ...val, anyOf: [...val?.anyOf ?? []] };
    for (const [key, obj] of Object.entries(release)) {
      const resolveType = (obj as { __resolveType: string })?.__resolveType;
      if (
        resolveType &&
        manifestBlocks.blocks?.[ref]?.[resolveType] !== undefined
      ) {
        root[ref].anyOf!.push(
          resolvable(
            resolveType,
            key,
          ),
        );
        if (ref === "sections") { // sections can be used individually so it can be replicated on the loop below.
          continue;
        }
        delete release[key];
      }
    }
  }

  const definitions: Record<string, JSONSchema7> = {};
  for (const [ref, val] of Object.entries(schema.definitions)) {
    const anyOf = val.anyOf;
    definitions[ref] = val;
    const first = anyOf && (anyOf[0] as JSONSchema7).$ref;
    if (first === "#/definitions/Resolvable") {
      anyOf?.splice(0, 1);
      definitions[ref] = { ...val, anyOf: [...val?.anyOf ?? []] };
      const availableFunctions = (anyOf?.map((func) =>
        getResolveType(func)
      ) ?? []).filter(notUndefined).reduce((acc, f) => {
        acc[f] = true;
        return acc;
      }, {} as Record<string, boolean>);
      for (const [key, obj] of Object.entries(release)) {
        const resolveType = (obj as { __resolveType: string })
          ?.__resolveType;

        if (
          resolveType &&
          availableFunctions[resolveType]
        ) {
          definitions[ref].anyOf?.push(resolvable(
            (obj as { __resolveType: string })?.__resolveType ??
              "UNKNOWN",
            key,
          ));
        }
      }
    }
  }
  return { definitions, root };
};

export const genMetaInfo = async (release: Release): Promise<MetaInfo> => {
  const revision = await release.revision();

  const { manifest, sourceMap } = await context.runtime!;
  const manfiestBlocks = toManifestBlocks(
    manifest,
  );
  if (revision !== latestRevision || mschema === null) {
    mschema = buildSchemaWithResolvables(
      manfiestBlocks,
      await genSchemas(manifest, sourceMap),
      { ...await release.state() },
    );
    latestRevision = revision;
  }

  const info: MetaInfo = {
    major: parse(meta.version).major,
    version: meta.version,
    namespace: context.namespace!,
    site: context.site!,
    manifest: manfiestBlocks,
    schema: mschema,
  };

  return info;
};

const sf = singleFlight<string>();
const binaryId = context.deploymentId ?? crypto.randomUUID();
export const handler = async (
  req: Request,
  ctx: HandlerContext<unknown, DecoState<unknown, DecoSiteState>>,
) => {
  const timing = ctx.state.t?.start("fetch-revision");
  const revision = await ctx.state.release.revision();
  timing?.end();
  const etag = `${revision}@${binaryId}`;
  const ifNoneMatch = req.headers.get("if-none-match");
  if (ifNoneMatch === etag || ifNoneMatch === `W/${etag}`) { // weak etags should be tested as well.
    return new Response(null, { status: 304, headers: allowCorsFor(req) }); // not modified
  }
  const info = await sf.do(
    "metaInfo",
    () => genMetaInfo(ctx.state.release).then(JSON.stringify),
  );

  return new Response(
    info,
    {
      headers: {
        "Content-Type": "application/json",
        "cache-control": "must-revalidate",
        etag,
        ...allowCorsFor(req),
      },
    },
  );
};
