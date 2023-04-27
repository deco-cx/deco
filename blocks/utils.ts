// deno-lint-ignore-file no-explicit-any
import {
  Block,
  BlockModule,
  ComponentFunc,
  PreactComponent,
} from "$live/engine/block.ts";
import { Resolver } from "$live/engine/core/resolver.ts";
import { PromiseOrValue, singleFlight } from "$live/engine/core/utils.ts";
import { ResolverMiddlewareContext } from "$live/engine/middleware.ts";
import { JSX } from "preact";
import { HttpContext } from "./handler.ts";

export type SingleFlightKeyFunc<TConfig = any, TCtx = any> = (
  args: TConfig,
  ctx: TCtx,
) => string;

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

// deno-lint-ignore ban-types
export type FnContext<TState = {}> = TState & {
  reqUrl: string;
};

export type FnProps<
  TProps = any,
  TResp = any,
> = (props: TProps, ctx: FnContext) => PromiseOrValue<TResp>;

export const applyProps = <
  TProps = any,
  TResp = any,
>(func: {
  default: FnProps<TProps, TResp>;
}) =>
async ($live: TProps, ctx: HttpContext<{ global: any }>) => { // by default use global state
  return await func.default(
    $live,
    { ...ctx?.context?.state?.global ?? {}, reqUrl: ctx.request.url },
  );
};

export const fromComponentFunc: Block["adapt"] = <TProps = any>(
  { default: Component }: { default: ComponentFunc<TProps> },
  component: string,
): Resolver =>
(props: TProps, { resolveChain }): PreactComponent<any, TProps> => ({
  Component,
  props,
  metadata: {
    component,
    resolveChain,
    id: resolveChain.length > 0 ? resolveChain[0] : undefined,
  },
});

export const usePreviewFunc = <TProps = any>(
  Component: ComponentFunc<TProps>,
): Resolver =>
(component: PreactComponent<any, TProps>): PreactComponent<any, TProps> => ({
  ...component,
  Component,
});

export const newComponentBlock = <K extends string>(
  type: K,
  defaultDanglingRecover?: Resolver<PreactComponent> | Resolver<
    PreactComponent
  >[],
): Block<
  BlockModule<ComponentFunc, JSX.Element | null, PreactComponent>,
  ComponentFunc,
  K
> => ({
  type,
  introspect: {
    default: "0",
  },
  defaultDanglingRecover,
  defaultPreview: (comp) => comp,
  adapt: fromComponentFunc,
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
