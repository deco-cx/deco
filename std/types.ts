import { HandlerContext } from "$fresh/server.ts";
import { LivePageData } from "../types.ts";

export type LoaderFunction<Props = unknown, Data = unknown, State = unknown> = (
  req: Request,
  ctx: HandlerContext<LivePageData, State>,
  props: Props,
) => Promise<{ data: Data } & Partial<Pick<Response, "status" | "headers">>>;

export type MatchDuration = "request" | "session";

export type MatchFunction<
  Props = Record<string, unknown> | undefined,
  State = unknown,
> = (
  req: Request,
  ctx: HandlerContext<LivePageData, State>,
  props: Props,
) => { isMatch: boolean; duration: MatchDuration };

export type EffectFunction<
  Props = Record<string, unknown> | undefined,
  State = unknown,
> = (
  req: Request,
  ctx: HandlerContext<LivePageData, State>,
  props: Props,
) => void;
