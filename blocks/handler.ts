// deno-lint-ignore-file no-explicit-any
import { HandlerContext } from "$fresh/server.ts";
import { applyConfig, configOnly } from "$live/blocks/utils.ts";
import { Block, InstanceOf } from "$live/engine/block.ts";
import { BaseContext, ResolveFunc } from "$live/engine/core/resolver.ts";
import { PromiseOrValue } from "$live/engine/core/utils.ts";

export type LiveConfig<TConfig = any, TState = unknown> = TState & {
  $live: TConfig;
  resolve: ResolveFunc;
};

export type FreshHandler<
  TConfig = any,
  TData = any,
  TState = any,
  Resp = Response
> = (
  request: Request,
  ctx: HandlerContext<TData, LiveConfig<TState, TConfig>>
) => PromiseOrValue<Resp>;

export interface FreshContext<Data = any, State = any, TConfig = any>
  extends BaseContext {
  context: HandlerContext<Data, LiveConfig<State, TConfig>>;
  request: Request;
}

type HandlerFunc<TConfig = any> = (config: TConfig) => FreshHandler;

const handlerBlock: Block<HandlerFunc> = {
  type: "handlers",
  introspect: configOnly("./handlers"),
  adapt: applyConfig,
};

// @ts-ignore: "waiting for the engine to be completed"
export type Handler = InstanceOf<typeof handlerBlock, "#/root/handlers">;

/**
 * (config: TConfig) => (req:Request, ctx: HandlerContext) => Promise<Response> | Response
 * Handlers blocks returns http handlers
 */
export default handlerBlock;
