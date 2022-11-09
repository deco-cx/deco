import { HandlerContext } from "$fresh/server.ts";

export type LoaderFunction<I, O> = (
  req: Request,
  ctx: HandlerContext,
  props: I
) => Promise<{ data: O } & Partial<Pick<Response, "status" | "headers">>>;
