import {
  beautify,
  denoDoc,
  findExport,
  getSchemaId,
  tsTypeToSchema,
} from "./transform.ts";
import { Schema } from "$live/types.ts";
import { basename } from "std/path/mod.ts";

const withErrorPath = <T>(cb: (x: string) => T) => async (path: string) => {
  try {
    return await cb(path);
  } catch (error) {
    console.error(`Error while generating schema for ${path}`);

    throw error;
  }
};

export const getSchemaFromSectionExport = withErrorPath(
  async (path: string) => {
    const nodes = await denoDoc(path);
    const node = findExport("default", nodes);

    if (!node) return { inputSchema: null, outputSchema: null };

    if (node.kind !== "variable" && node.kind !== "function") {
      throw new Error(
        `Section default export needs to be a component like element`,
      );
    }

    if (node.kind === "function" && node.functionDef.params.length > 1) {
      throw new Error(
        `Section function component should have at most one argument`,
      );
    }

    const tsType = node.kind === "variable"
      ? node.variableDef.tsType
      : node.functionDef.params[0]?.tsType;

    // Only fetching inputSchema (from exported Props) if the default function
    // has its input type specified ({ ... }: Props)
    const inputSchema = tsType && await tsTypeToSchema(tsType, nodes);

    // Add a rich name to the editor
    if (inputSchema) {
      inputSchema.title = beautify(basename(path));
    }

    return {
      inputSchema: inputSchema ?? null,
      outputSchema: null,
    };
  },
);

export const getSchemaFromLoaderExport = withErrorPath(async (path: string) => {
  const nodes = await denoDoc(path);
  const node = findExport("default", nodes);

  if (!node) return { inputSchema: null, outputSchema: null };

  if (node.kind !== "variable") {
    throw new Error("Default export needs to be a const variable");
  }

  const tsType = node.variableDef.tsType;

  if (
    tsType.kind !== "typeRef" ||
    tsType.typeRef.typeName in
      ["LoaderFunction", "MatchFunction", "EffectFunction"]
  ) {
    throw new Error(`Default export needs to be of type LoaderFunction`);
  }

  const [propType = null, returnType = null] = tsType.typeRef.typeParams ?? [];

  const inputSchema = propType && await tsTypeToSchema(propType, nodes);
  const outputType = returnType && await tsTypeToSchema(returnType, nodes);
  const outputSchema: Schema | null = outputType && {
    type: "object",
    properties: {
      data: {
        "$id": await getSchemaId(outputType),
      },
    },
    additionalProperties: true,
  };

  // Add a rich name to the editor
  if (inputSchema) {
    inputSchema.title = beautify(basename(path));
  }

  return {
    inputSchema: inputSchema ?? null,
    outputSchema: outputSchema ?? null,
  };
});

// TODO: Should we extract defaultProps from the schema here?
export const generatePropsForSchema = (schema: Schema | null | undefined) => {
  if (schema?.type == null || Array.isArray(schema.type)) {
    return null;
  }

  const cases: Record<string, unknown> = {
    object: {},
    array: [],
    boolean: true,
    number: 0,
    integer: 0,
    null: null,
  };

  return cases[schema.type] ?? null;
};
