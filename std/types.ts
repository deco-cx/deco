import { HandlerContext } from "$fresh/server.ts";
import { CacheOptions } from "../utils/functions.ts";

export type LoaderFunction<Props = any, Data = any, State = any> = (
  req: Request,
  ctx: HandlerContext<any, State>,
  props: Props,
) => Promise<{ data: Data } & Partial<Pick<Response, "status" | "headers">>> & Partial<CacheOptions>;

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

export type LoaderReturnType<O = unknown> = O;
