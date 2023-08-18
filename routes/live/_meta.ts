import { HandlerContext } from "$fresh/server.ts";
import { major } from "std/semver/mod.ts";
import { JSONSchema7 } from "../../deps.ts";
import { Resolvable } from "../../engine/core/resolver.ts";
import { notUndefined, singleFlight } from "../../engine/core/utils.ts";
import { Schemas } from "../../engine/schema/builder.ts";
import { namespaceOf } from "../../engine/schema/gen.ts";
import { genSchemas } from "../../engine/schema/reader.ts";
import { context } from "../../live.ts";
import meta from "../../meta.json" assert { type: "json" };
import { AppManifest, LiveConfig, LiveState } from "../../types.ts";
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
    baseUrl?: string;
    routes?: unknown;
  },
): ManifestBlocks => {
  const {
    baseUrl: _ignoreBaseUrl,
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

let mschema: Schemas | null = null;
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
        resolveType.includes(`/${ref}/`)
      ) {
        root[ref].anyOf!.push(
          resolvable(
            resolveType,
            key,
          ),
        );
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

const sf = singleFlight<string>();
export const handler = async (
  req: Request,
  ctx: HandlerContext<unknown, LiveConfig<unknown, LiveState>>,
) => {
  const info = await sf.do("schema", async () => {
    const end = ctx.state.t?.start("fetch-revision");
    const revision = await ctx.state.release.revision();
    end?.();

    if (revision !== latestRevision || mschema === null) {
      const endBuildSchema = ctx.state?.t?.start("build-resolvables");
      mschema = buildSchemaWithResolvables(
        await genSchemas(ctx.state.manifest, ctx.state.sourceMap),
        { ...await ctx.state.resolve({ __resolveType: "resolvables" }) },
      );
      latestRevision = revision;
      endBuildSchema?.();
    }

    const info: MetaInfo = {
      major: major(meta.version),
      version: meta.version,
      namespace: context.namespace!,
      site: context.site!,
      manifest: toManifestBlocks(ctx.state.manifest),
      schema: mschema,
    };

    return JSON.stringify(info);
  });

  return new Response(
    info,
    {
      headers: {
        "Content-Type": "application/json",
        ...allowCorsFor(req),
      },
    },
  );
};
