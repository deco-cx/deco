// deno-lint-ignore-file no-explicit-any
import { HandlerContext } from "$fresh/server.ts";
import { Block, FunctionBlockDefinition } from "$live/block.ts";
import { PromiseOrValue } from "$live/engine/core/utils.ts";
import { findAllReturning } from "$live/engine/schema/utils.ts";
import { JSX } from "preact";
import { Json } from "../previews/Json.tsx";

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
  ctx: HandlerContext<TData, TState & { $config: TConfig }>
) => PromiseOrValue<Resp>;

const loaderBlock: Block<LoaderFunction<any, any, any, any>> = {
  preview: async (loader, ctx) => {
    const result = await loader(ctx.request, ctx.context);
    return {
      Component: Json,
      props: {
        obj: JSON.stringify(result),
      },
    };
  },
  run: async (loader, { request, context }) => {
    const result = await loader(request, context);
    return Response.json(result, { status: 200 });
  },
  type: "loader",
  adapt: (loaderFunc) => ($live, ctx) => {
    return loaderFunc(ctx.request, {
      ...ctx.context,
      state: { ...ctx.context.state, $live },
    });
  },
  findModuleDefinitions: async (ast) => {
    const fns = await findAllReturning(
      { typeName: "LoaderReturn", importUrl: import.meta.url },
      ast
    );
    return fns.reduce((fns, fn) => {
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

      return [
        ...fns,
        {
          name: fn.name,
          input: configType,
          output: fn.return.typeRef.typeParams![0],
        },
      ];
    }, [] as FunctionBlockDefinition[]);
  },
};

export default loaderBlock;
