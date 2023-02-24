// deno-lint-ignore-file no-explicit-any
import { BaseContext } from "$live/engine/core/resolver.ts";
import { PromiseOrValue } from "$live/engine/core/utils.ts";
import { HandlerContext } from "$fresh/server.ts";
import { JSX } from "preact";

export type FreshHandler<
  TConfig = any,
  TData = any,
  TState = any,
  Resp = Response
> = (
  request: Request,
  ctx: HandlerContext<TData, TState & { $live: TConfig }>
) => PromiseOrValue<Resp>;

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

export const componentAdapter = <TProps>(
  Component: ComponentFunc<any, TProps>
): ((props: TProps) => PreactComponent) => {
  const func = (props: TProps): PreactComponent => {
    return {
      Component,
      props,
    };
  };
  return func;
};

export interface FreshContext<Data = any, State = any> extends BaseContext {
  context: HandlerContext<Data, State>;
  request: Request;
}

export const loaderAdapter =
  <T, TConfig, TData, TState>(
    loader: FreshHandler<TConfig, TData, TState, T>
  ) =>
  <TContext extends FreshContext>(
    $live: TConfig,
    ctx: TContext
  ): PromiseOrValue<T> => {
    return loader(ctx.request, {
      ...ctx.context,
      state: { ...ctx.context.state, $live },
    });
  };

export const freshAdapter =
  <TConfig, TData, TState>(handler: FreshHandler<TConfig, TData, TState>) =>
  <TContext extends FreshContext>(
    $live: TConfig,
    ctx: TContext
  ): PromiseOrValue<Response> => {
    return handler(ctx.request, {
      ...ctx.context,
      state: { ...ctx.context.state, $live },
    });
  };

export const Fresh = freshAdapter((_, ctx) => {
  return ctx.render(ctx.state.$live);
});
