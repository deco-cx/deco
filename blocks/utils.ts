import { JSONSchema7 } from "json-schema";
import { FunctionBlockDefinition } from "$live/engine/block.ts";
import { ASTNode, TsType } from "$live/engine/schema/ast.ts";
import {
  inlineOrSchemeable,
  Schemeable,
  TransformContext,
} from "$live/engine/schema/transformv2.ts";

export const fnDefinitionToSchemeable = (
  transformContext: TransformContext,
  ast: ASTNode[],
  validFn: FunctionBlockDefinition,
): Schemeable => {
  const inputSchemeable = inlineOrSchemeable(
    transformContext,
    ast,
    validFn.input,
  );
  const outputSchemeable = inlineOrSchemeable(
    transformContext,
    ast,
    validFn.output,
  );
  return {
    required: ["input", "output"],
    title: validFn.name,
    type: "object",
    id: validFn.name,
    value: {
      output: {
        title: (validFn.output as TsType).repr ??
          (validFn.output as JSONSchema7).title,
        jsDocSchema: {},
        schemeable: outputSchemeable!,
      },
      ...(inputSchemeable
        ? {
          input: {
            title: (validFn.input as TsType).repr ??
              (validFn.input as JSONSchema7).title,
            jsDocSchema: {},
            schemeable: inputSchemeable,
          },
        }
        : {}),
    },
  };
};
