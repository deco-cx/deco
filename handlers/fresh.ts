import { HandlerContext } from "$fresh/server.ts";
import { PageInstance } from "$live/blocks/page.ts";

export interface FreshConfig {
  component: PageInstance;
}

export default function Fresh(page: FreshConfig) {
  return (_: Request, ctx: HandlerContext) => ctx.render(page);
}
