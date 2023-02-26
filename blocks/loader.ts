// deno-lint-ignore-file no-explicit-any
import { HandlerContext } from "$fresh/server.ts";
import { fnDefinitionToSchemeable } from "$live/blocks/utils.ts";
import { Block, BlockDefinitions } from "$live/engine/block.ts";
import { PromiseOrValue } from "$live/engine/core/utils.ts";
import { findAllReturning } from "$live/engine/schema/utils.ts";

export type LoaderReturn<TReturn = any> = PromiseOrValue<TReturn>;

export type LoaderFunction<
  TConfig = any,
  TData = any,
  TState = any,
  Resp = Response
> = (
  request: Request,
  ctx: HandlerContext<TData, TState & { $live: TConfig }>
) => PromiseOrValue<Resp>;

const blockType = "loader";
const loaderBlock: Block<LoaderFunction<any, any, any, any>> = {
  import: "$live/blocks/loader.ts",
  type: blockType,
  adapt: (loaderFunc) => ($live, ctx) => {
    return loaderFunc(ctx.request, {
      ...ctx.context,
      state: { ...ctx.context.state, $live },
    });
  },
  findModuleDefinitions: async (transformContext, [path, ast]) => {
    const fns = await findAllReturning(
      transformContext,
      { typeName: "LoaderReturn", importUrl: import.meta.url },
      ast
    );

    const validFns = await Promise.all(
      fns.map(async (fn) => {
        if (
          fn.return.kind !== "typeRef" ||
          (fn.return.typeRef.typeParams &&
            fn.return.typeRef.typeParams.length < 1)
        ) {
          return undefined;
        }
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

        const configType = liveConfig.typeRef.typeParams[0];
        return {
          import: fn.name === "default" ? path : `${path}@${fn.name}`,
          schemeable: await fnDefinitionToSchemeable(
            transformContext,
            [path, ast],
            {
              name: fn.name === "default" ? path : `${path}@${fn.name}`,
              input: configType,
              output: fn.return.typeRef.typeParams![0],
            }
          ),
        };
      })
    );
    return validFns.reduce(
      (def, fn) => {
        if (!fn) {
          return def;
        }
        return {
          ...def,
          imports: [...def.imports, fn.import],
          schemeables: [...def?.schemeables, fn.schemeable],
        };
      },
      {
        imports: [],
        schemeables: [],
      } as BlockDefinitions
    );
  },
};

export default loaderBlock;
