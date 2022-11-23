import {
  denoDoc,
  findExport,
  getSchemaId,
  tsTypeToSchema,
} from "./transform.ts";
import { Schema } from "$live/types.ts";

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

    const inputSchema = tsType && await tsTypeToSchema(tsType, nodes);

    return {
      inputSchema: inputSchema ?? null,
      outputSchema: null,
    };
  },
);

export const getSchemaFromLoaderExport = withErrorPath(async (path: string) => {
  const nodes = await denoDoc(path);
  const node = findExport("default", nodes);

  if (node.kind !== "variable") {
    throw new Error("Default export needs to be a const variable");
  }

  const tsType = node.variableDef.tsType;

  if (
    tsType.kind !== "typeRef" ||
    tsType.typeRef.typeName !== "LoaderFunction"
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

  return {
    inputSchema: inputSchema ?? null,
    outputSchema: outputSchema ?? null,
  };
});
