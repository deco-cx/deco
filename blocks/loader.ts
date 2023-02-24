// deno-lint-ignore-file no-explicit-any
import { HandlerContext } from "$fresh/server.ts";
import { fnDefinitionToSchemeable } from "$live/blocks/utils.ts";
import { Block, BlockDefinitions } from "$live/engine/block.ts";
import { PromiseOrValue } from "$live/engine/core/utils.ts";
import { findAllReturning } from "$live/engine/schema/utils.ts";
import { JSX } from "preact";

export type ComponentFunc<
  TReturn extends JSX.Element = JSX.Element,
  TProps = any
> = (props: TProps) => TReturn;

export interface PreactComponent<
  TReturn extends JSX.Element = JSX.Element,
  TProps = any
> {
  Component: ComponentFunc<TReturn, TProps>;
  props: TProps;
}

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
  import: import.meta.url,
  type: blockType,
  adapt: (loaderFunc) => ($live, ctx) => {
    return loaderFunc(ctx.request, {
      ...ctx.context,
      state: { ...ctx.context.state, $live },
    });
  },
  findModuleDefinitions: (transformContext, [path, ast]) => {
    const fns = findAllReturning(
      transformContext,
      { typeName: "LoaderReturn", importUrl: import.meta.url },
      ast
    );

    return fns.reduce(
      (fns, fn) => {
        if (
          fn.return.kind !== "typeRef" ||
          (fn.return.typeRef.typeParams &&
            fn.return.typeRef.typeParams.length < 1)
        ) {
          return fns;
        }
        if (fn.params.length !== 2) {
          return fns;
        }
        const ctx = fn.params[1];
        if (ctx.kind !== "typeRef" || !ctx.typeRef.typeParams) {
          return fns;
        }
        if (ctx.typeRef.typeParams.length < 2) {
          return fns;
        }
        const liveConfig = ctx.typeRef.typeParams[1];
        if (liveConfig.kind !== "typeRef") {
          return fns;
        }

        if (
          !liveConfig.typeRef.typeParams ||
          liveConfig.typeRef.typeParams.length === 0
        ) {
          return fns;
        }

        const configType = liveConfig.typeRef.typeParams[0];
        return {
          ...fns,
          imports: [
            ...fns.imports,
            fn.name === "default" ? path : `${path}@${fn.name}`,
          ],
          schemeables: [
            ...fns.schemeables,
            fnDefinitionToSchemeable(transformContext, ast, {
              name: fn.name === "default" ? path : `${path}@${fn.name}`,
              input: configType,
              output: fn.return.typeRef.typeParams![0],
            }),
          ],
        };
      },
      { imports: [], schemeables: [] } as BlockDefinitions
    );
  },
};

export default loaderBlock;
