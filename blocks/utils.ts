// deno-lint-ignore-file no-explicit-any
import { HttpContext, StatefulContext } from "$live/blocks/handler.ts";
import { JSONSchema7 } from "$live/deps.ts";
import {
  Block,
  BlockModuleRef,
  ComponentFunc,
  FunctionBlockDefinition,
  PreactComponent,
} from "$live/engine/block.ts";
import { Resolver } from "$live/engine/core/resolver.ts";
import { PromiseOrValue, singleFlight } from "$live/engine/core/utils.ts";
import { ResolverMiddlewareContext } from "$live/engine/middleware.ts";
import {
  inlineOrSchemeable,
  Schemeable,
  TransformContext,
  tsTypeToSchemeable,
} from "$live/engine/schema/transform.ts";
import {
  findExport,
  fnDefinitionRoot,
  FunctionTypeDef,
} from "$live/engine/schema/utils.ts";
import {
  DocNode,
  TsTypeDef,
} from "https://deno.land/x/deno_doc@0.58.0/lib/types.d.ts";

export type SingleFlightKeyFunc<TConfig = any, TCtx = any> = (
  args: TConfig,
  ctx: TCtx,
) => string;
export const fnDefinitionToSchemeable = async (
  ast: [string, DocNode[]],
  validFn: FunctionBlockDefinition,
): Promise<Schemeable> => {
  const inputSchemeable = await inlineOrSchemeable(ast, validFn.input);
  const outputSchemeable = await inlineOrSchemeable(ast, validFn.output);
  return {
    required: ["input", "output"],
    title: validFn.name,
    type: "object",
    id: validFn.name,
    value: {
      output: {
        title: (validFn.output as TsTypeDef).repr ??
          (validFn.output as JSONSchema7).title,
        jsDocSchema: {},
        schemeable: outputSchemeable!,
      },
      ...(inputSchemeable
        ? {
          input: {
            title: (validFn.input as TsTypeDef).repr ??
              (validFn.input as JSONSchema7).title,
            jsDocSchema: {},
            schemeable: inputSchemeable,
          },
        }
        : {}),
    },
  };
};

export const applyConfig = <
  TConfig = any,
  TResp = any,
  TFunc extends (c: TConfig) => TResp = any,
>(func: {
  default: TFunc;
}) =>
async ($live: TConfig) => {
  return await func.default($live);
};

export const applyConfigFunc = <
  TConfig = any,
  TResp extends (...args: any[]) => any = any,
  TFunc extends (c: TConfig) => TResp = any,
>(func: {
  default: TFunc;
}) =>
async ($live: TConfig) => {
  const resp = await func.default($live);
  return typeof resp === "function" ? resp : () => resp;
};

export const configOnly = async (
  transformationContext: TransformContext,
  path: string,
  ast: DocNode[],
): Promise<BlockModuleRef | undefined> => {
  const func = findExport("default", ast);
  if (!func) {
    return undefined;
  }
  const [fn, root] = await fnDefinitionRoot(transformationContext, func, [
    path,
    ast,
  ]);
  if (!fn) {
    throw new Error(
      `Default export of ${path} needs to be a const variable or a function`,
    );
  }

  return {
    functionRef: path,
    inputSchema: fn.params.length > 0 && fn.params[0]
      ? await tsTypeToSchemeable(fn.params[0], root)
      : undefined,
  };
};

export type StatefulHandler<
  TConfig,
  TResp,
  TCtx extends StatefulContext<TConfig> = StatefulContext<TConfig>,
> = (req: Request, ctx: TCtx) => PromiseOrValue<TResp>;

interface GlobalConfig {
  __globals: any;
}

export const isGlobalConfig = <T>(
  value: T | GlobalConfig,
): value is GlobalConfig => {
  return (value as GlobalConfig)?.__globals !== undefined;
};
export const configAsState = <
  TCtx extends StatefulContext<any> = StatefulContext<any>,
  TConfig = any,
  TResp = any,
>(func: {
  default: StatefulHandler<TConfig, TResp, TCtx>;
}) =>
async ($live: TConfig, ctx: HttpContext<any, any, TCtx>) => {
  const global = isGlobalConfig($live) ? $live.__globals : {};
  return await func.default(ctx.request, {
    ...ctx.context,
    state: { ...ctx.context.state, $live, resolve: ctx.resolve, global },
  });
};

const configTsType = (fn: FunctionTypeDef): TsTypeDef | undefined => {
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

export const fromFreshLikeHandler = async (
  transformationContext: TransformContext,
  path: string,
  ast: DocNode[],
): Promise<BlockModuleRef | undefined> => {
  const func = findExport("default", ast);
  if (!func) {
    return undefined;
  }
  const [fn, root] = await fnDefinitionRoot(transformationContext, func, [
    path,
    ast,
  ]);
  if (!fn) {
    throw new Error(
      `Default export of ${path} needs to be a const variable or a function`,
    );
  }

  const configType = configTsType(fn);

  return {
    functionRef: path,
    inputSchema: configType
      ? await tsTypeToSchemeable(configType, root)
      : undefined,
    outputSchema: fn.return
      ? await tsTypeToSchemeable(fn.return, root)
      : undefined,
  };
};

export const fromComponentFunc: Block["adapt"] = <TProps = any>(
  { default: Component }: { default: ComponentFunc<TProps> },
  resolver: string,
): Resolver =>
(props: TProps, { resolveChain }): PreactComponent<any, TProps> => ({
  Component,
  props,
  metadata: {
    component: resolver,
    resolveChain,
    id: resolveChain.length > 0 ? resolveChain[0] : undefined,
  },
});

export const instrospectComponentFunc = async (
  ctx: TransformContext,
  path: string,
  ast: DocNode[],
) => {
  const func = findExport("default", ast);
  if (!func) {
    return undefined;
  }
  const [fn, root] = await fnDefinitionRoot(ctx, func, [path, ast]);
  if (!fn) {
    throw new Error(
      `Default export of ${path} needs to be a const variable or a function`,
    );
  }
  const inputTsType = fn.params.length > 0 ? fn.params[0] : undefined;
  return {
    functionRef: path,
    inputSchema: inputTsType
      ? await tsTypeToSchemeable(inputTsType, root)
      : undefined,
  };
};

export const newComponentBlock = <K extends string>(
  type: K,
  defaultDanglingRecover?: Resolver<PreactComponent> | Resolver<
    PreactComponent
  >[],
): Block<ComponentFunc, PreactComponent, K> => ({
  type,
  defaultDanglingRecover,
  defaultPreview: (comp) => comp,
  adapt: fromComponentFunc,
  introspect: instrospectComponentFunc,
});

export const newSingleFlightGroup = <
  TConfig = any,
  TContext extends ResolverMiddlewareContext<any> = ResolverMiddlewareContext<
    any
  >,
>(singleFlightKeyFunc?: SingleFlightKeyFunc<TConfig, TContext>) => {
  const flights = singleFlight();
  return (c: TConfig, ctx: TContext) => {
    if (!singleFlightKeyFunc) {
      return ctx.next!();
    }
    return flights.do(
      `${singleFlightKeyFunc(c, ctx)}`,
      () => ctx.next!(),
    );
  };
};
