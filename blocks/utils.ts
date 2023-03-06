// deno-lint-ignore-file no-explicit-any
import { ComponentFunc, PreactComponent } from "$live/blocks/types.ts";
import JsonViewer from "$live/blocks/utils.tsx";
import {
  FreshContext,
  FreshHandler,
} from "$live/engine/adapters/fresh/manifest.ts";
import {
  Block,
  BlockModuleRef,
  FunctionBlockDefinition,
} from "$live/engine/block.ts";
import { ASTNode, TsType } from "$live/engine/schema/ast.ts";
import {
  inlineOrSchemeable,
  Schemeable,
  TransformContext,
  tsTypeToSchemeable,
} from "$live/engine/schema/transform.ts";
import {
  findExport,
  FunctionTypeDef,
  nodeToFunctionDefinition,
} from "$live/engine/schema/utils.ts";
import { JSONSchema7 } from "json-schema";

export const fnDefinitionToSchemeable = async (
  transformContext: TransformContext,
  ast: [string, ASTNode[]],
  validFn: FunctionBlockDefinition
): Promise<Schemeable> => {
  const inputSchemeable = await inlineOrSchemeable(
    transformContext,
    ast,
    validFn.input
  );
  const outputSchemeable = await inlineOrSchemeable(
    transformContext,
    ast,
    validFn.output
  );
  return {
    required: ["input", "output"],
    title: validFn.name,
    type: "object",
    id: validFn.name,
    value: {
      output: {
        title:
          (validFn.output as TsType).repr ??
          (validFn.output as JSONSchema7).title,
        jsDocSchema: {},
        schemeable: outputSchemeable!,
      },
      ...(inputSchemeable
        ? {
            input: {
              title:
                (validFn.input as TsType).repr ??
                (validFn.input as JSONSchema7).title,
              jsDocSchema: {},
              schemeable: inputSchemeable,
            },
          }
        : {}),
    },
  };
};

export const applyConfig =
  <
    TConfig = any,
    TResp = any,
    TFunc extends (c: TConfig) => TResp = any
  >(func: {
    default: TFunc;
  }) =>
  async ($live: TConfig) => {
    return await func.default($live);
  };

export const applyConfigFunc =
  <
    TConfig = any,
    TResp extends (...args: any[]) => any = any,
    TFunc extends (c: TConfig) => TResp = any
  >(func: {
    default: TFunc;
  }) =>
  async ($live: TConfig) => {
    const resp = await func.default($live);
    return typeof resp === "function" ? resp : () => resp;
  };

export const configOnly =
  (requiredPath: string) =>
  async (
    transformationContext: TransformContext,
    path: string,
    ast: ASTNode[]
  ): Promise<BlockModuleRef | undefined> => {
    if (!path.startsWith(requiredPath)) {
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

    return {
      functionRef: path,
      inputSchema:
        fn.params.length > 0 && fn.params[0]
          ? await tsTypeToSchemeable(transformationContext, fn.params[0], [
              path,
              ast,
            ])
          : undefined,
    };
  };

export const configAsState =
  <
    TConfig = any,
    TResp = any,
    TFunc extends FreshHandler<TConfig, any, any, TResp> = any
  >(func: {
    default: TFunc;
  }) =>
  async ($live: TConfig, ctx: FreshContext) => {
    return await func.default(ctx.request, {
      ...ctx.context,
      state: { ...ctx.context.state, $live, resolve: ctx.resolve },
    });
  };

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

export const fromFreshLikeHandler =
  (requiredPath: string) =>
  async (
    transformationContext: TransformContext,
    path: string,
    ast: ASTNode[]
  ): Promise<BlockModuleRef | undefined> => {
    if (!path.startsWith(requiredPath)) {
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
      outputSchema: fn.return
        ? await tsTypeToSchemeable(transformationContext, fn.return, [
            path,
            ast,
          ])
        : undefined,
    };
  };

export const fromComponentFunc =
  <TProps = any>({ default: Component }: { default: ComponentFunc<TProps> }) =>
  (props: TProps) => ({
    Component,
    props,
  });

export const instrospectComponentFunc =
  (requiredPath: string) =>
  async (ctx: TransformContext, path: string, ast: ASTNode[]) => {
    if (!path.startsWith(requiredPath)) {
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
    const inputTsType = fn.params.length > 0 ? fn.params[0] : undefined;
    return {
      functionRef: path,
      inputSchema: inputTsType
        ? await tsTypeToSchemeable(ctx, inputTsType, [path, ast])
        : undefined,
    };
  };

export const newComponentBlock = <K extends string>(
  type: K
): Block<ComponentFunc, PreactComponent, K> => ({
  type,
  defaultPreview: (comp) => comp,
  adapt: fromComponentFunc,
  introspect: instrospectComponentFunc(`./${type}`),
});

export const newHandlerLikeBlock = <R = any, K extends string = string>(
  type: K
): Block<FreshHandler<any, any, any, any>, R, K> => ({
  type,
  defaultPreview: (result) => {
    return { Component: JsonViewer, props: { body: JSON.stringify(result) } };
  },
  introspect: fromFreshLikeHandler(`./${type}`),
  adapt: configAsState,
});
