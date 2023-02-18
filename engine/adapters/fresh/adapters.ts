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
  ctx: HandlerContext<TData, TState & { $config: TConfig }>
) => PromiseOrValue<Resp>;

export type ComponentFunc<TProps = any> = (props: TProps) => JSX.Element;

export interface PreactComponent<TProps = any> {
  Component: ComponentFunc<TProps>;
  props: TProps;
}

export const componentAdapter = <TProps>(
  Component: ComponentFunc<TProps>
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
    $config: TConfig,
    ctx: TContext
  ): PromiseOrValue<T> => {
    return loader(ctx.request, {
      ...ctx.context,
      state: { ...ctx.context.state, $config },
    });
  };

export const freshAdapter =
  <TConfig, TData, TState>(handler: FreshHandler<TConfig, TData, TState>) =>
  <TContext extends FreshContext>(
    $config: TConfig,
    ctx: TContext
  ): PromiseOrValue<Response> => {
    return handler(ctx.request, {
      ...ctx.context,
      state: { ...ctx.context.state, $config },
    });
  };

export const Fresh = freshAdapter((_, ctx) => {
  return ctx.render(ctx.state.$config);
});
