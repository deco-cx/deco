import { HandlerContext } from "$fresh/server.ts";
import { Schemas } from "$live/engine/schema/builder.ts";
import { namespaceOf } from "$live/engine/schema/gen.ts";
import { getCurrent } from "$live/engine/schema/reader.ts";
import { context } from "$live/live.ts";
import meta from "$live/meta.json" assert { type: "json" };
import { DecoManifest, LiveConfig } from "$live/types.ts";
import { allowCorsFor } from "$live/utils/http.ts";
import { major } from "std/semver/mod.ts";
import Ajv from "https://esm.sh/ajv@8.12.0";
import { JSONSchema7 } from "$live/deps.ts";

let validator: Ajv | null = null;

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

const resolvable = (ref: string, id: string): JSONSchema7 => {
  return {
    title: `${ref}@${id}`,
    type: "object",
    required: ["__resolveType"],
    properties: {
      __resolveType: {
        type: "string",
        enum: [id],
        default: id,
      },
    },
  };
};
export const handler = async (
  req: Request,
  ctx: HandlerContext<unknown, LiveConfig>,
) => {
  const [schema, _release] = await Promise.all([
    getCurrent(),
    ctx.state.release.state(),
  ]);
  const release = { ..._release };
  validator ??= new Ajv({ strictSchema: false, strict: false }).addSchema({
    ...schema,
    definitions: {
      ...schema.definitions,
      Resolvable: {
        additionalProperties: false,
        type: "object",
        required: ["__NEVER__VALID"],
        properties: {
          __NEVER__VALID: {
            type: "string",
          },
        },
      },
    },
    $id: "defs.json",
  });

  const newRoot: Record<string, JSONSchema7> = {};
  const { loaders: _, functions: __, ...root } = schema.root;
  for (const [ref, val] of Object.entries(root)) {
    newRoot[ref] = { ...val };
    const compiled = validator.compile({
      $ref: `defs.json#/root/${ref}`,
      $id: "",
    });
    for (const [key, obj] of Object.entries(release)) {
      if (
        compiled(obj)
      ) {
        newRoot[ref].anyOf!.push(
          resolvable(
            (obj as { __resolveType: string })?.__resolveType ?? "UNKNOWN",
            key,
          ),
        );
        delete release[key];
      }
    }
  }

  const newDefinitions: Record<string, JSONSchema7> = {};
  for (const [ref, val] of Object.entries(schema.definitions)) {
    newDefinitions[ref] = { ...val };
    const anyOf = newDefinitions[ref]?.anyOf;
    if (
      anyOf && (anyOf[0] as JSONSchema7)?.$ref === "#/definitions/Resolvable"
    ) { // is loader
      const compiled = validator.compile({
        $ref: `defs.json#/definitions/${ref}`,
        $id: "",
      });
      for (const [key, obj] of Object.entries(release)) {
        if (
          compiled(obj)
        ) {
          anyOf.push(
            resolvable(
              (obj as { __resolveType: string })?.__resolveType ?? "UNKNOWN",
              key,
            ),
          );
          delete release[key];
        }
      }
    }
  }

  const info: MetaInfo = {
    major: major(meta.version),
    version: meta.version,
    namespace: context.namespace!,
    site: context.site!,
    manifest: toManifestBlocks(context.manifest!),
    schema: { definitions: newDefinitions, root: newRoot },
  };
  return new Response(
    JSON.stringify(info),
    {
      headers: {
        "Content-Type": "application/json",
        ...allowCorsFor(req),
      },
    },
  );
};
