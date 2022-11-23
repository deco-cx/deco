import { HandlerContext } from "$fresh/server.ts";

export type LoaderFunction<Props = any, Data = any, State = any> = (
  req: Request,
  ctx: HandlerContext<any, State>,
  props?: Props,
) => Promise<{ data: Data } & Partial<Pick<Response, "status" | "headers">>>;

export type MatchDuration = "request" | "session";

export type MatchFunction<
  Props = any,
  Data = any,
  State = any,
> = (
  req: Request,
  ctx: HandlerContext<Data, State>,
  props: Props,
) => { isMatch: boolean; duration: MatchDuration };

export type EffectFunction<
  Props = any,
  Data = any,
  State = any,
> = (
  req: Request,
  ctx: HandlerContext<Data, State>,
  props: Props,
) => void;
