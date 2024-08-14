import type { ComponentChildren } from "preact";
import type { Page } from "../blocks/page.tsx";

export { Hono } from "@hono/hono";
export type { Context, Handler, Input, MiddlewareHandler } from "@hono/hono";
export type { Env } from "@hono/hono/types";

export { serveStatic, upgradeWebSocket } from "@hono/hono/deno";
export interface PageData {
  page: Page;
  heads?: ComponentChildren[];
}

// JSR does not support global declares which is the hono way for overriding ContextRenderer function
// https://hono.dev/docs/api/context#render-setrenderer
// sadly we need to ignore some typescript errors here
// declare module "jsr:@hono/hono@^4.5.3" {
//   interface ContextRenderer {
//     <T extends PageData = PageData>(
//       data: T,
//     ): Promise<Response> | Response;
//   }
// }

export interface ContextRenderer {
  <T extends PageData = PageData>(
    data: T,
  ): Promise<Response> | Response;
}
