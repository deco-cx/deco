// deno-lint-ignore-file no-explicit-any
import { applyConfig, configOnly } from "$live/blocks/utils.ts";
import { Block, InstanceOf } from "$live/engine/block.ts";
import { BaseContext, ResolveFunc } from "$live/engine/core/resolver.ts";
import { Handler as DenoHandler } from "std/http/server.ts";
import { PromiseOrValue } from "$live/engine/core/utils.ts";

export type LiveConfig<TConfig = any, TState = unknown> = TState & {
  $live: TConfig;
  resolve: ResolveFunc;
};

export interface StatefulContext<T> {
  state: T;
}

export interface HttpContext<
  State = any,
  TConfig = any,
  TCtx extends StatefulContext<any> = StatefulContext<
    LiveConfig<State, TConfig>
  >
> extends BaseContext {
  context: TCtx;
  request: Request;
}

export type HttpHandler = <State = any, TConfig = any>(
  req: Request,
  ctx: HttpContext<State, TConfig>,
) => PromiseOrValue<Response>;

type HandlerFunc<TConfig = any> = (config: TConfig) => DenoHandler;

const handlerBlock: Block<HandlerFunc> = {
  type: "handlers",
  introspect: configOnly("./handlers"),
  adapt: applyConfig,
};

export type Handler = InstanceOf<typeof handlerBlock, "#/root/handlers">;

/**
 * (config: TConfig) => (req:Request, ctx: HttpContext) => Promise<Response> | Response
 * Handlers blocks returns http handlers
 */
export default handlerBlock;
