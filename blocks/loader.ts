import { Block } from "$live/engine/block.ts";
import { findExport, FunctionTypeDef } from "$live/engine/schema/utils.ts";
import { FreshHandler } from "../engine/adapters/fresh/manifest.ts";
import { TsType } from "../engine/schema/ast.ts";
import { tsTypeToSchemeable } from "../engine/schema/transform.ts";
import { nodeToFunctionDefinition } from "../engine/schema/utils.ts";
import JsonViewer from "$live/blocks/utils.tsx";

export type Loader<TConfig = unknown, TResponse = unknown> = FreshHandler<
  TConfig,
  unknown,
  unknown,
  TResponse
>;

const configTsType = (fn: FunctionTypeDef): TsType | undefined => {
  if (fn.params.length !== 2) {
    return undefined;
  }
  const ctx = fn.params[1];
  if (ctx.kind !== "typeRef" || !ctx.typeRef.typeParams) {
    return undefined;
  }
  if (ctx.typeRef.typeParams.length < 2) {
    return undefined;
  }
  const liveConfig = ctx.typeRef.typeParams[1];
  if (liveConfig.kind !== "typeRef") {
    return undefined;
  }

  if (
    !liveConfig.typeRef.typeParams ||
    liveConfig.typeRef.typeParams.length === 0
  ) {
    return undefined;
  }

  return liveConfig.typeRef.typeParams[0];
};
const sectionBlock: Block<Loader> = {
  defaultPreview: (result) => {
    return { Component: JsonViewer, props: { body: JSON.stringify(result) } };
  },
  type: "loaders",
  introspect: async (transformationContext, path, ast) => {
    if (!path.startsWith("./loaders")) {
      return undefined;
    }
    const func = findExport("default", ast);
    if (!func) {
      return undefined;
    }
    const fn = nodeToFunctionDefinition(func);
    if (!fn) {
      throw new Error(
        `Default export of ${path} needs to be a const variable or a function`
      );
    }

    const configType = configTsType(fn);

    return {
      functionRef: path,
      inputSchema: configType
        ? await tsTypeToSchemeable(transformationContext, configType, [
            path,
            ast,
          ])
        : undefined,
      outputSchema: await tsTypeToSchemeable(transformationContext, fn.return, [
        path,
        ast,
      ]),
    };
  },
  adapt:
    ({ default: Component }) =>
    (props) => ({
      Component,
      props,
    }),
};

export default sectionBlock;
