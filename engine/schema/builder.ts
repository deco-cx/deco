import { JSONSchema7 } from "$live/deps.ts";
import { mergeJSONSchemas } from "$live/engine/schema/merge.ts";
import { schemeableToJSONSchema } from "$live/engine/schema/schemeable.ts";
import { Schemeable } from "$live/engine/schema/transform.ts";
import { fileSeparatorToSlash } from "$live/utils/filesystem.ts";

export interface Schemas {
  definitions: Record<string, JSONSchema7>;
  root: Record<string, JSONSchema7>;
}

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
  functionKey: string;
  inputSchemaId: string | undefined;
  outputSchemaId: string | undefined;
}

const resolvableRef = {
  $ref: "#/definitions/Resolvable",
};

const resolvableReferenceSchema: JSONSchema7 = {
  $id: "Resolvable",
  title: "Select from saved",
  required: ["__resolveType"],
  additionalProperties: false,
  properties: {
    __resolveType: {
      type: "string",
    },
  },
};
/**
 * Used as a schema for the return value of the given function.
 * E.g, let's say you have a function that returns a boolean, and this function is referenced by `deco-sites/std/myBooleanFunction.ts`
 * Say this function receives a input named `BooleanFunctionProps` that takes any arbitrary data.
 * This function takes the mentioned parameters (functionRef and inputSchema) and builds a JSONSchema that uses the input as `allOf` property ("extends")
 * and a required property `__resolveType` pointing to the mentioned function.
 *
 * {
 * type: "object"
 * allOf: [{$ref: "#/definitions/deco-sites/std/myBooleanFunction.ts@BooleanFunctionProps"}]
 * properties: { __resolveType: "deco-sites/std/myBooleanFunction.ts"}
 * }
 */
const functionRefToSchemeable = ({
  functionKey,
  inputSchemaId,
}: ResolverRef): Schemeable => {
  return {
    name: "",
    file: functionKey,
    friendlyId: functionKey,
    type: "inline",
    value: {
      title: functionKey,
      type: "object",
      allOf: inputSchemaId
        ? [{ $ref: `#/definitions/${inputSchemaId}` }]
        : undefined,
      required: ["__resolveType"],
      properties: {
        __resolveType: {
          type: "string",
          enum: [functionKey],
          default: functionKey,
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
  /**
   * Returns the schema data raw
   */
  data: SchemaData;
  /**
   * Build the final schema.
   * @param base the current directory.
   * @param namespace the current repository namespace.
   * @returns the built Schemas.
   */
  build(base: string, namespace: string): Schemas;
  /**
   * Add a new block schema to the schema.
   * @param blockSchema is the refernece to the configuration input and the blockfunction output
   */
  withBlockSchema(blockSchema: BlockModule | EntrypointModule): SchemaBuilder;
}

/**
 * Best effort function. Trying to guess the organization/repository of a given file.
 * fallsback to the complete file address.
 * @param base is the current directory
 * @param namespace is the current namespace
 * @returns the canonical file representation. e.g deco-sites/std/types.ts
 */
const canonicalFileWith =
  (base: string, namespace: string) => (file: string): string => {
    if (file.startsWith("https://denopkg.com")) {
      const [url, versionAndFile] = file.split("@");
      const [_ignoreVersion, ...files] = versionAndFile.split("/");
      return url.substring("https://denopkg.com".length + 1) + "/" +
        files.join("/");
    }
    if (file.startsWith(base)) { // file url
      return `${namespace}${file.replace(base, "")}`;
    }
    if (file.startsWith("http")) {
      const url = new URL(file);
      // trying to guess, best effort
      const [_, org, repo, _skipVersion, ...rest] = url.pathname.split("/");
      return `${org}/${repo}/${rest.join("/")}`;
    }
    return file;
  };

const isEntrypoint = (
  m: BlockModule | EntrypointModule,
): m is EntrypointModule => {
  return (m as EntrypointModule).key !== undefined;
};

export const newSchemaBuilder = (initial: SchemaData): SchemaBuilder => {
  return {
    data: initial,
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
    build(base: string, namespace: string) {
      // Utility functions
      const canonical = canonicalFileWith(
        fileSeparatorToSlash(base),
        namespace,
      );
      const schemeableId = (
        schemeable: Schemeable,
      ): [string | undefined, string | undefined] => {
        const file = schemeable.file ? canonical(schemeable.file) : undefined;
        if (schemeable.id) {
          return [schemeable.id, file];
        }
        if (!file) {
          return [undefined, undefined];
        }
        const fileHash = btoa(file);
        const id = schemeable.name
          ? `${fileHash}@${schemeable.name!}`
          : fileHash;
        return [id, file];
      };
      const genId = (schemeable: Schemeable) => {
        if (schemeable.name !== undefined) {
          return schemeableId(schemeable)[0];
        }
        return undefined;
      };
      // add a new schemeable to the definitions
      const addSchemeable = (
        def: Schemas["definitions"],
        schemeable?: Schemeable,
      ): [Schemas["definitions"], string | undefined] => {
        if (schemeable) {
          const [id, file] = schemeableId(schemeable);
          const currSchemeable = {
            friendlyId: file && schemeable.name
              ? `${file}@${schemeable.name}`
              : undefined,
            ...schemeable,
            id,
          };
          const [nDef] = schemeableToJSONSchema(genId, def, currSchemeable);
          return [nDef, id];
        }
        return [def, undefined];
      };
      // end of utility functions

      // build all schemeable to JsonSchema
      // generate schemeable id based on http and file system
      const [definitionsWithSchemeables, functionRefs] = initial.blockModules
        .reduce(
          ([def, resolvers], mod) => {
            const [defOut, idOut] = addSchemeable(def, mod.outputSchema);
            const [defIn, idIn] = addSchemeable(defOut, mod.inputSchema);
            return [
              defIn,
              [
                ...resolvers,
                {
                  blockType: mod.blockType,
                  functionKey: mod.functionKey,
                  inputSchemaId: idIn, // supporting only one prop input for now @author Marcos V. Candeia
                  outputSchemaId: idOut,
                },
              ],
            ];
          },
          [{
            ...initial.schema.definitions,
            [resolvableReferenceSchema.$id!]: resolvableReferenceSchema,
          }, []] as [
            Schemas["definitions"],
            ResolverRef[],
          ],
        );

      // for all function refs add the function schemeable to all schema outputs
      const [definitionsWithFuncRefs, root] = functionRefs.reduce(
        ([currentDefinitions, currentRoot], rs) => {
          const schemeable = functionRefToSchemeable(rs);
          const [nDef, id] = addSchemeable(currentDefinitions, schemeable);
          const currAnyOfs = currentRoot[rs.blockType]?.anyOf ??
            [resolvableRef];

          return [
            {
              ...nDef,
              ...rs.outputSchemaId
                ? {
                  [rs.outputSchemaId]: mergeJSONSchemas(
                    resolvableRef,
                    nDef[rs.outputSchemaId],
                    nDef[id!]!,
                  ),
                }
                : {},
            },
            {
              ...currentRoot,
              [rs.blockType]: {
                title: rs.blockType,
                anyOf: [...currAnyOfs, { $ref: `#/definitions/${id}` }],
              },
            },
          ];
        },
        [definitionsWithSchemeables, initial.schema.root] as [
          Schemas["definitions"],
          Schemas["root"],
        ],
      );

      // Generate the root state config which contains all possible configurations as additional properties.
      const configState = Object.keys(root).reduce(
        (curr, key) => {
          return { ...curr, anyOf: [...curr.anyOf, { $ref: `#/root/${key}` }] };
        },
        {
          anyOf: [] as JSONSchema7[],
        },
      );

      // generate the final definitions and the entrypoint config
      const [finalDefs, entrypoint] = initial.entrypoints.reduce(
        ([defs, entr], blkEntry) => {
          const [nDefs, id] = addSchemeable(defs, blkEntry.config);
          if (!id || id.length === 0) {
            return [defs, entr];
          }
          return [
            nDefs,
            {
              ...entr,
              required: [...(entr.required ?? []), blkEntry.key],
              properties: {
                ...entr.properties,
                [blkEntry.key]: {
                  anyOf: [{
                    $ref: `#/definitions/${id}`,
                  }],
                },
              },
            },
          ];
        },
        [
          definitionsWithFuncRefs,
          {
            type: "object",
            required: [],
            properties: {},
            ...(root["state"] ?? {}), // should we include only catchall?
          },
        ] as [Schemas["definitions"], JSONSchema7],
      );
      return {
        definitions: finalDefs,
        root: {
          ...root,
          entrypoint,
          state: {
            allOf: [{ $ref: "#/root/entrypoint" }],
            additionalProperties: configState,
          },
        },
      };
    },
  };
};
