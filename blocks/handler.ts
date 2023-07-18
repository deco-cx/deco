// deno-lint-ignore-file no-explicit-any
import { ServeHandler } from "$fresh/src/server/deps.ts";
import { applyConfig } from "$live/blocks/utils.tsx";
import { Block, BlockModule, InstanceOf } from "$live/engine/block.ts";
import { BaseContext } from "$live/engine/core/resolver.ts";
import { PromiseOrValue } from "$live/engine/core/utils.ts";
import { LiveConfig, StatefulContext } from "$live/types.ts";
import { Handler as DenoHandler } from "std/http/server.ts";

export interface HttpContext<
  // deno-lint-ignore ban-types
  State = {},
  TConfig = any,
  TCtx extends StatefulContext<LiveConfig<TConfig, State>> = StatefulContext<
    LiveConfig<TConfig, State>
  >,
> extends BaseContext {
  context: TCtx;
  request: Request;
}

export type HttpHandler = <State = any, TConfig = any>(
  req: Request,
  ctx: HttpContext<State, TConfig>,
) => PromiseOrValue<Response>;

type HandlerFunc<TConfig = any> = (
  config: TConfig,
) => DenoHandler | ServeHandler;

const handlerBlock: Block<BlockModule<HandlerFunc>> = {
  type: "handlers",
  introspect: {
    default: "0",
  },
  adapt: applyConfig,
};

export type Handler = InstanceOf<typeof handlerBlock, "#/root/handlers">;

/**
 * (config: TConfig) => (req:Request, ctx: HttpContext) => Promise<Response> | Response
 * Handlers blocks returns http handlers
 */
export default handlerBlock;
