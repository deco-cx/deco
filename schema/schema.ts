import { denoDoc, findExport, tsTypeToSchema } from "./transform.ts";
import type { JSONSchema7 } from "json-schema";

export type Schema = JSONSchema7;

const withErrorPath = <T>(cb: (x: string) => T) => async (path: string) => {
  try {
    return await cb(path);
  } catch (error) {
    console.error(`Error while generating schema for ${path}`);

    throw error;
  }
};

export const getSchemaFromExport = withErrorPath(async (path: string) => {
  const nodes = await denoDoc(path);
  const node = findExport("default", nodes);

  if (node.kind !== "variable") {
    throw new Error("Default export needs to be a const variable");
  }

  const tsType = node.variableDef.tsType;

  if (
    tsType.kind !== "typeRef"
  ) {
    throw new Error(`Default export needs to be typed.`);
  }

  return tsTypeToSchema(tsType, nodes);
});
