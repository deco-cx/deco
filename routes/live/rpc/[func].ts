// deno-lint-ignore-file no-explicit-any
import { IS_BROWSER } from "$fresh/runtime.ts";
import { HandlerContext } from "$fresh/server.ts";
import { PromiseOrValue } from "$live/engine/core/utils.ts";
import { MiddlewareConfig } from "$live/routes/_middleware.ts";
import { LiveConfig, LiveState } from "$live/types.ts";

type Args = readonly any[];
const funcs: Record<
  string,
  (
    state: LiveConfig<MiddlewareConfig, LiveState>,
    ...args: any
  ) => PromiseOrValue<any> | void
> = {};

export const onServer = <
  T,
  TArgs extends Args,
>(
  id: string,
  serverFunc: (
    state: LiveConfig<MiddlewareConfig, LiveState>,
    ...args: TArgs
  ) => PromiseOrValue<T>,
): (
  ...args: TArgs
) => Promise<T> => {
  if (!IS_BROWSER) {
    funcs[id] = serverFunc;
  }
  return async (...args: TArgs) => {
    return await fetch(`/live/rpc/${id}`, {
      method: "POST",
      body: JSON.stringify({ params: args }),
    }).then((resp) => resp.json().then((d) => d.data));
  };
};

export const handler = async (
  req: Request,
  ctx: HandlerContext<unknown, LiveConfig<MiddlewareConfig, LiveState>>,
) => {
  const body = await req.json();
  const f = funcs[ctx.params.func];

  const funcId = `func-${ctx.params.func}`;
  const end = ctx.state.t.start(funcId);
  const data = await f(ctx.state, ...body.params);
  end();
  return Response.json(
    { data },
  );
};
