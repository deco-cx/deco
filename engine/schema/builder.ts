import { JSONSchema7 } from "../../deps.ts";
import { mergeJSONSchemas } from "../../engine/schema/merge.ts";
import { schemeableToJSONSchema } from "../../engine/schema/schemeable.ts";
import { Schemeable } from "../../engine/schema/transform.ts";

export interface Schemas {
  definitions: Record<string, JSONSchema7>;
  root: Record<string, JSONSchema7>;
}

export interface BlockModule {
  blockType: string;
  functionKey: string; // this key should contain the module namespace
  inputSchema?: Schemeable;
  outputSchema?: Schemeable;
  functionJSDoc?: JSONSchema7;
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
  functionJSDoc?: JSONSchema7;
}

const ResolvableId = "Resolvable";
const resolvableRef = {
  $ref: `#/definitions/${ResolvableId}`,
};

const resolvableReferenceSchema = {
  title: "Select from saved",
  type: "object",
  required: ["__resolveType"],
  additionalProperties: false,
  properties: {
    __resolveType: {
      type: "string",
    },
  },
} satisfies JSONSchema7;

const withNotResolveType = (
  resolveType: string,
  rs: JSONSchema7,
): JSONSchema7 => {
  const currResolveType = rs?.properties?.__resolveType as
    | JSONSchema7
    | undefined;
  const notEnum = currResolveType?.not as JSONSchema7 | undefined;
  const newProperties = {
    __resolveType: {
      type: "string",
      not: {
        enum: [
          ...(notEnum?.enum) ?? [],
          resolveType,
        ],
      },
    },
  };
  return {
    ...rs,
    properties: newProperties as JSONSchema7["properties"],
  };
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
const blockFunctionToSchemeable = ({
  functionKey,
  inputSchemaId,
  functionJSDoc,
}: ResolverRef): Schemeable => {
  return {
    name: "",
    file: functionKey,
    friendlyId: functionJSDoc?.title || functionKey,
    type: "inline",
    value: {
      title: functionKey,
      ...functionJSDoc,
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
   * @returns the built Schemas.
   */
  build(): Schemas;
  /**
   * Add a new block schema to the schema.
   * @param blockSchema is the refernece to the configuration input and the blockfunction output
   */
  withBlockSchema(blockSchema: BlockModule | EntrypointModule): SchemaBuilder;
}

const isEntrypoint = (
  m: BlockModule | EntrypointModule,
): m is EntrypointModule => {
  return (m as EntrypointModule).key !== undefined;
};
/**
 * Parses the mime type of the given dataUri.
 * it should follows: https://en.wikipedia.org/wiki/Data_URI_scheme
 * eg: `data:text/tsx;path=${encodeURIComponent(path)};charset=utf-8;base64,${
    btoa(modData)
  }`
 */
const parseDataUriMimeTypes = (dataUri: string): Record<string, string> => {
  const mimeTypes: Record<string, string> = {};
  const [media, _ignoreContent] = dataUri.split(",");
  const [_ignoreContentTypeAndData, ...mimeTypesArray] = media.split(";");
  for (const mimeType of mimeTypesArray) {
    const [key, value] = mimeType.split("=");
    if (key && value) {
      mimeTypes[key] = decodeURIComponent(value);
    }
  }
  return mimeTypes;
};

function fileUniqueId(
  fileUrl: string,
): [string, string] {
  if (fileUrl.startsWith("data:")) {
    const mimeTypes = parseDataUriMimeTypes(fileUrl);
    const virtualPath = mimeTypes["path"] ?? crypto.randomUUID();
    return [virtualPath, virtualPath];
  }
  return [btoa(fileUrl), fileUrl];
}

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
    build() {
      const schemeableId = (
        schemeable: Schemeable,
        resolvePath = true,
      ): [string | undefined, string | undefined] => {
        const file = schemeable.file
          ? resolvePath ? import.meta.resolve(schemeable.file) : schemeable.file
          : undefined;
        const friendlyIdFor = (file?: string) =>
          file && schemeable.name ? `${file}@${schemeable.name}` : undefined;
        if (schemeable.id) {
          return [schemeable.id, friendlyIdFor(file)];
        }
        if (!file) {
          return [undefined, undefined];
        }
        const [fileHash, actualFileUrl] = fileUniqueId(file);
        const id = schemeable.name
          ? `${fileHash.replaceAll("/", "-")}@${schemeable.name!}`
          : fileHash;
        return [id, friendlyIdFor(actualFileUrl)];
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
        resolvePath = true,
      ): [Schemas["definitions"], string | undefined] => {
        if (schemeable) {
          const [id, friendlyId] = schemeableId(schemeable, resolvePath);
          const currSchemeable = {
            friendlyId,
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
                  functionJSDoc: mod.functionJSDoc,
                  inputSchemaId: idIn, // supporting only one prop input for now @author Marcos V. Candeia
                  outputSchemaId: idOut,
                },
              ],
            ];
          },
          [{
            ...initial.schema.definitions,
            [ResolvableId]: resolvableReferenceSchema,
          }, []] as [
            Schemas["definitions"],
            ResolverRef[],
          ],
        );

      // for all function refs add the function schemeable to all schema outputs
      const [definitionsWithFuncRefs, root] = functionRefs.reduce(
        ([currentDefinitions, currentRoot], blockFunction) => {
          const schemeable = blockFunctionToSchemeable(blockFunction);
          const [nDef, id] = addSchemeable(
            currentDefinitions,
            schemeable,
            false,
          );
          const currAnyOf = currentRoot[blockFunction.blockType]?.anyOf;
          const currAnyOfs = currAnyOf ??
            [resolvableRef];
          currAnyOfs.length === 0 && currAnyOfs.push(resolvableRef);

          return [
            {
              ...nDef,
              [ResolvableId]: withNotResolveType(
                blockFunction.functionKey,
                nDef[ResolvableId],
              ),
              ...blockFunction.outputSchemaId
                ? {
                  [blockFunction.outputSchemaId]: mergeJSONSchemas(
                    resolvableRef,
                    nDef[blockFunction.outputSchemaId],
                    nDef[id!]!,
                  ),
                }
                : {},
            },
            {
              ...currentRoot,
              [blockFunction.blockType]: {
                title: blockFunction.blockType,
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
