import { LiveFunctionContext, Page } from "$live/types.ts";

export type LoaderFunction<Props = unknown, Data = unknown, State = unknown> = (
  req: Request,
  ctx: LiveFunctionContext<State>,
  props: Props,
) => Promise<{ data: Data } & Partial<Pick<Response, "status" | "headers">>>;
