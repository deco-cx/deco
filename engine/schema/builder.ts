import { Schemas } from "$live/engine/adapters/fresh/manifestBuilder.ts";
import { deepMergeDefinitions } from "$live/engine/adapters/fresh/merge.ts";
import { fromFileUrl } from "https://deno.land/std@0.170.0/path/mod.ts";
import { JSONSchema7 } from "json-schema";
import { mergeJSONSchemas } from "../adapters/fresh/merge.ts";
import { schemeableToJSONSchema } from "./schemeable.ts";
import { Schemeable } from "./transform.ts";

export interface BlockModule {
  blockType: string;
  functionKey: string; // this key should contain the module namespace
  inputSchema?: Schemeable;
  outputSchema?: Schemeable;
}

// FIXME it should have a better way to handle it @author Marcos V. Candeia
export interface EntrypointModule {
  key: string;
  config: Schemeable;
}

interface ResolverRef {
  blockType: string;
  key: string;
  inputSchemaId: string | undefined;
  outputSchemaIds: string[];
}

const resolverRefToSchemeable = ({
  key,
  inputSchemaId,
}: ResolverRef): Schemeable => {
  return {
    name: "",
    file: key,
    friendlyId: key,
    type: "inline",
    value: {
      title: key,
      type: "object",
      allOf: inputSchemaId ? [{ $ref: `#/definitions/${inputSchemaId}` }] : [],
      required: ["__resolveType"],
      properties: {
        __resolveType: {
          type: "string",
          default: key,
        },
      },
    },
  };
};
export interface SchemaData {
  schema: Schemas;
  blockModules: BlockModule[];
  entrypoints: EntrypointModule[];
}
export interface SchemaBuilder {
  data: SchemaData;
  build(base: string, key: string): Schemas;
  mergeWith(other: Schemas): SchemaBuilder;
  withBlockSchema(blockSchema: BlockModule | EntrypointModule): SchemaBuilder;
}
const mergeSchemasRoot = (
  a: Schemas["root"],
  b: Schemas["root"]
): Schemas["root"] => {
  const mergedRoot: Schemas["root"] = {};
  const allRootBlocks = { ...a, ...b };

  for (const block of Object.keys(allRootBlocks)) {
    const duplicated: Record<string, boolean> = {};
    mergedRoot[block] = {
      title: block,
      anyOf: [...(a[block]?.anyOf ?? []), ...(b[block]?.anyOf ?? [])].filter(
        (ref) => {
          const $ref = (ref as JSONSchema7).$ref!;
          const has = duplicated[$ref!];
          duplicated[$ref] = true;
          return !has;
        }
      ),
    };
  }
  return mergedRoot;
};

const beautifyFileNameWith =
  (base: string, key: string) =>
  (file: string): string => {
    if (file.startsWith("https://denopkg.com")) {
      const [url] = file.split("@");
      return url.substring("https://denopkg.com".length + 1);
    }
    if (file.startsWith("file://")) {
      const withoutFile = fromFileUrl(file);
      if (withoutFile.startsWith(base)) {
        return `${key}${withoutFile.replace(base, "")}`;
      }
      return withoutFile;
    }
    if (file.startsWith("./")) {
      return `${key}${file.replace(".", "")}`;
    }
    if (file.startsWith("http")) {
      const url = new URL(file);
      // trying to guess, best effort
      const [_, org, repo, _skipVersion, ...rest] = url.pathname.split("/");
      return `${org}/${repo}/${rest.join("/")}`;
    }
    return file;
  };
const mergeStates = (a: JSONSchema7, b: JSONSchema7): JSONSchema7 => {
  return {
    ...a,
    ...b,
    required: [...(a?.required ?? []), ...(b?.required ?? [])],
    properties: {
      ...(a?.properties ?? {}),
      ...(b?.properties ?? {}),
    },
  };
};

const isEntrypoint = (
  m: BlockModule | EntrypointModule
): m is EntrypointModule => {
  return (m as EntrypointModule).key !== undefined;
};
export const newSchemaBuilder = (initial: SchemaData): SchemaBuilder => {
  return {
    data: initial,
    mergeWith({ root, definitions }: Schemas): SchemaBuilder {
      const newRoot = mergeSchemasRoot(initial.schema["root"], root);
      const newRootState = mergeStates(
        initial.schema["root"]["state"],
        root.state
      );
      const newDefinitions = deepMergeDefinitions(
        initial.schema["definitions"],
        definitions
      );
      return newSchemaBuilder({
        ...initial,
        schema: {
          root: { ...newRoot, state: newRootState },
          definitions: newDefinitions,
        },
      });
    },
    withBlockSchema(schema: BlockModule | EntrypointModule): SchemaBuilder {
      if (isEntrypoint(schema)) {
        return newSchemaBuilder({
          ...initial,
          entrypoints: [...initial.entrypoints, schema],
        });
      }
      // routes is always entrypoints
      if (schema.blockType === "routes" && schema.inputSchema) {
        return newSchemaBuilder({
          ...initial,
          entrypoints: [
            ...initial.entrypoints,
            {
              key: schema.functionKey,
              config: schema.inputSchema,
            },
          ],
        });
      }
      return newSchemaBuilder({
        ...initial,
        blockModules: [...initial.blockModules, schema],
      });
    },
    build(base: string, key: string) {
      const beautify = beautifyFileNameWith(base, key);
      const schemeableId = (
        schemeable: Schemeable
      ): [string, string | undefined] => {
        const file = schemeable.file ? beautify(schemeable.file) : undefined;
        if (schemeable.id) {
          return [schemeable.id, file];
        }
        const fileHash = file ? btoa(file) : crypto.randomUUID();
        const id = schemeable.name
          ? `${fileHash}@${schemeable.name!}`
          : fileHash;
        return [id, file];
      };
      const genId = (s: Schemeable) => {
        if (s.name !== undefined) {
          return schemeableId(s)[0];
        }
        return undefined;
      };
      const addSchemeable = (
        def: Schemas["definitions"],
        schemeable?: Schemeable
      ): [Schemas["definitions"], string[] | undefined] => {
        if (schemeable) {
          const [id, file] = schemeableId(schemeable);
          let currSchemeable = {
            friendlyId: `${file}@${schemeable.name}`,
            ...schemeable,
            id,
          };
          const ids = [id];
          if (currSchemeable.type === "union") {
            // if union generate id for each schemeable
            const unionSchemeables = currSchemeable.value.map((s) => {
              const [id, file] = schemeableId(s);
              ids.push(id);
              return {
                friendlyId: `${file}@${s.name}`,
                ...s,
                id,
              };
            });
            currSchemeable = { ...currSchemeable, value: unionSchemeables };
          }
          const [nDef] = schemeableToJSONSchema(genId, def, currSchemeable);
          return [nDef, ids];
        }
        return [def, undefined];
      };
      // build all schemeable to JsonSchema
      // generate schemeable id based on http and file system
      const [d, r] = initial.blockModules.reduce(
        ([def, resolvers], mod) => {
          const [defOut, idOut] = addSchemeable(def, mod.outputSchema);
          const [defIn, idIn] = addSchemeable(defOut, mod.inputSchema);
          return [
            defIn,
            [
              ...resolvers,
              {
                blockType: mod.blockType,
                key: mod.functionKey,
                inputSchemaId: idIn ? idIn[0] : undefined, // supporting only one prop input for now @author Marcos V. Candeia
                outputSchemaIds: idOut ? idOut : [],
              },
            ],
          ];
        },
        [initial.schema.definitions, []] as [
          Schemas["definitions"],
          ResolverRef[]
        ]
      );
      const [def, root] = r.reduce(
        ([d, r], rs) => {
          const schemeable = resolverRefToSchemeable(rs);
          const [nDef, id] = addSchemeable(d, schemeable);
          const funcSchema = id ? nDef[id[0]] : undefined;
          const currAnyOfs = r[rs.blockType]?.anyOf ?? [];

          const newDef = rs.outputSchemaIds.reduce((definiz, outId) => {
            const outSchema = d[outId];
            return {
              ...definiz,
              [outId]:
                outSchema === undefined
                  ? undefined
                  : mergeJSONSchemas(outSchema as JSONSchema7, funcSchema),
            };
          }, nDef);
          return [
            newDef,
            {
              ...r,
              [rs.blockType]: {
                title: rs.blockType,
                anyOf: [...currAnyOfs, { $ref: `#/definitions/${id}` }],
              },
            },
          ];
        },
        [d, initial.schema.root] as [Schemas["definitions"], Schemas["root"]]
      );
      const configState = Object.keys(root).reduce(
        (curr, key) => {
          return { ...curr, anyOf: [...curr.anyOf, { $ref: `#/root/${key}` }] };
        },
        { anyOf: [] as JSONSchema7[] }
      );
      const [finalDefs, entrypoint] = initial.entrypoints.reduce(
        ([defs, entr], blkEntry) => {
          const [nDefs, id] = addSchemeable(defs, blkEntry.config);
          return [
            nDefs,
            {
              ...entr,
              required: [...(entr.required ?? []), blkEntry.key],
              properties: {
                ...entr.properties,
                [blkEntry.key]: {
                  $ref: `#/definitions/${id}`,
                },
              },
            },
          ];
        },
        [
          def,
          {
            type: "object",
            required: [],
            properties: {},
            ...(root["state"] ?? {}), // should we include only catchall?
            additionalProperties: configState,
          },
        ] as [Schemas["definitions"], JSONSchema7]
      );
      return { definitions: finalDefs, root: { ...root, state: entrypoint } };
    },
  };
};
