import { HandlerContext } from "$fresh/server.ts";

export type LoaderFunction<Props = unknown, Data = unknown, State = unknown> = (
  req: Request,
  ctx: HandlerContext<any, State>,
  props?: Props,
) => Promise<{ data: Data } & Partial<Pick<Response, "status" | "headers">>>;

export type MatchDuration = "request" | "session";

export type MatchFunction<
  Props = Record<string, unknown> | undefined,
  Data = unknown,
  State = unknown,
> = (
  req: Request,
  ctx: HandlerContext<Data, State>,
  props: Props,
) => { isMatch: boolean; duration: MatchDuration };

export type EffectFunction<
  Props = Record<string, unknown> | undefined,
  Data = unknown,
  State = unknown,
> = (
  req: Request,
  ctx: HandlerContext<Data, State>,
  props: Props,
) => void;
