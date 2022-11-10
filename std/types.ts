import { HandlerContext } from "$fresh/server.ts";
import { Page } from "../types.ts";

export type LoaderFunction<I = Record<string, unknown> | undefined, O = any> = (
  req: Request,
  ctx: HandlerContext<Page>,
  props: I
) => Promise<{ data: O } & Partial<Pick<Response, "status" | "headers">>>;
