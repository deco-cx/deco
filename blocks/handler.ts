// deno-lint-ignore-file no-explicit-any
import type { Handler as DenoHandler } from "../deps.ts";
import type { Block, BlockModule, InstanceOf } from "../engine/block.ts";
import type { BaseContext } from "../engine/core/resolver.ts";
import type { PromiseOrValue } from "../engine/core/utils.ts";
import type { DecoState, StatefulContext } from "../types.ts";
import {
  type FnContext,
  fnContextFromHttpContext,
  type RequestState,
} from "./utils.tsx";

export interface HttpContext<
  // deno-lint-ignore ban-types
  State = {},
  TConfig = any,
  TCtx extends StatefulContext<DecoState<TConfig, State>> = StatefulContext<
    DecoState<TConfig, State>
  >,
> extends BaseContext {
  context: TCtx;
  request: Request;
}

export type HttpHandler = <State = any, TConfig = any>(
  req: Request,
  ctx: HttpContext<State, TConfig>,
) => PromiseOrValue<Response>;

type HandlerFunc<TConfig = any, TState = any> = (
  config: TConfig,
  ctx: FnContext<TState>,
) => DenoHandler;

const handlerBlock: Block<BlockModule<HandlerFunc>> = {
  type: "handlers",
  adapt: <
    TConfig = any,
    // deno-lint-ignore ban-types
    TState = {},
  >(func: {
    default: HandlerFunc<TConfig, TState>;
  }) =>
  async (
    $live: TConfig,
    ctx: HttpContext<{ global: any } & RequestState>,
  ) => {
    return await func.default($live, fnContextFromHttpContext(ctx));
  },
};

export type Handler = InstanceOf<typeof handlerBlock, "#/root/handlers">;

/**
 * (config: TConfig) => (req:Request, ctx: HttpContext) => Promise<Response> | Response
 * Handlers blocks returns http handlers
 */
export default handlerBlock;
