import { HandlerContext } from "$fresh/server.ts";
import { Page } from "$live/blocks/page.ts";

export interface FreshConfig {
  page: Page;
}

export default function Fresh(page: FreshConfig) {
  return (_: Request, ctx: HandlerContext) => ctx.render(page);
}
