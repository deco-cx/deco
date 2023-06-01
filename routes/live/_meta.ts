import { HandlerContext } from "$fresh/server.ts";
import { JSONSchema7 } from "$live/deps.ts";
import { singleFlight } from "$live/engine/core/utils.ts";
import { Schemas } from "$live/engine/schema/builder.ts";
import { namespaceOf } from "$live/engine/schema/gen.ts";
import { getCurrent } from "$live/engine/schema/reader.ts";
import { context } from "$live/live.ts";
import meta from "$live/meta.json" assert { type: "json" };
import { DecoManifest, LiveConfig, LiveState } from "$live/types.ts";
import { allowCorsFor } from "$live/utils/http.ts";
import Ajv from "https://esm.sh/ajv@8.12.0";
import { major } from "std/semver/mod.ts";

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
    title: `#${ref}@${id}`,
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

let mschema: Schemas | null = null;
let latestRevision: string | null = null;
const sf = singleFlight<Response>();
export const handler = (
  req: Request,
  ctx: HandlerContext<unknown, LiveConfig<unknown, LiveState>>,
) => {
  return sf.do("schema", async () => {
    const end = ctx.state.t?.start("fetch-release");
    const [schema, _release, revision] = await Promise.all([
      getCurrent(),
      ctx.state.release.state({ forceFresh: false }),
      ctx.state.release.revision(),
    ]);
    end?.();
    if (revision !== latestRevision) {
      mschema = null;
      latestRevision = revision;
    }
    const release = { ..._release };
    validator ??= new Ajv({
      strictSchema: false,
      strict: false,
      verbose: false,
      logger: false,
    }).addSchema({
      ...schema,
      $id: "defs.json",
    });

    const buildSchemaWithResolvables = () => {
      const root: Record<string, JSONSchema7> = {};
      const { loaders: _, functions: __, ...currentRoot } = schema.root;
      for (const [ref, val] of Object.entries(currentRoot)) {
        root[ref] = { ...val, anyOf: [...val?.anyOf ?? []] };
        const validate = validator!.compile({
          $ref: `defs.json#/root/${ref}`,
          $id: "",
        });
        for (const [key, obj] of Object.entries(release)) {
          if (
            validate(obj)
          ) {
            root[ref].anyOf!.push(
              resolvable(
                (obj as { __resolveType: string })?.__resolveType ?? "UNKNOWN",
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
          const compiled = validator!.compile({
            $ref: `defs.json#/definitions/${ref}`,
            $id: "",
          });
          for (const [key, obj] of Object.entries(release)) {
            if (
              compiled(obj)
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
    const endBuildSchema = ctx.state?.t?.start("build-resolvables");
    mschema ??= buildSchemaWithResolvables();
    endBuildSchema?.();

    const info: MetaInfo = {
      major: major(meta.version),
      version: meta.version,
      namespace: context.namespace!,
      site: context.site!,
      manifest: toManifestBlocks(context.manifest!),
      schema: mschema,
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
  });
};
