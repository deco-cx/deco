import type { Page } from "../blocks/page.tsx";

export { Hono } from "jsr:@hono/hono@^4.5.3";
export type {
  Context,
  ContextRenderer,
  Handler,
  Input,
  MiddlewareHandler
} from "jsr:@hono/hono@^4.5.3";
export type { Env } from "jsr:@hono/hono@^4.5.3/types";

export { serveStatic, upgradeWebSocket } from "jsr:@hono/hono@^4.5.3/deno";
export interface PageData {
  page: Page;
}

declare module "jsr:@hono/hono@^4.5.3" {
  interface ContextRenderer {
    <T extends PageData = PageData>(
      data: T,
    ): Promise<Response> | Response;
  }
}
