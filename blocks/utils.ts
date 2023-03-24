// deno-lint-ignore-file no-explicit-any
import { HttpContext, StatefulContext } from "$live/blocks/handler.ts";
import { Block, ComponentFunc, PreactComponent } from "$live/engine/block.ts";
import { Resolver } from "$live/engine/core/resolver.ts";
import { PromiseOrValue, singleFlight } from "$live/engine/core/utils.ts";
import { ResolverMiddlewareContext } from "$live/engine/middleware.ts";

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

export type StatefulHandler<
  TConfig,
  TResp,
  TCtx extends StatefulContext<TConfig> = StatefulContext<TConfig>,
> = (req: Request, ctx: TCtx) => PromiseOrValue<TResp>;

export const configAsState = <
  TCtx extends StatefulContext<any> = StatefulContext<any>,
  TConfig = any,
  TResp = any,
>(func: {
  default: StatefulHandler<TConfig, TResp, TCtx>;
}) =>
async ($live: TConfig, ctx: HttpContext<any, any, TCtx>) => {
  return await func.default(ctx.request, {
    ...ctx.context,
    state: { ...ctx.context.state, $live, resolve: ctx.resolve },
  });
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

export const newComponentBlock = <K extends string>(
  type: K,
  defaultDanglingRecover?: Resolver<PreactComponent> | Resolver<
    PreactComponent
  >[],
): Block<ComponentFunc, PreactComponent, K> => ({
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
