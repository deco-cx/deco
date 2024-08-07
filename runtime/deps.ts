import type { Page } from "../blocks/page.tsx";

export { Hono } from "jsr:@hono/hono@^4.5.3";
export type {
  Context,
  Handler,
  Input,
  MiddlewareHandler
} from "jsr:@hono/hono@^4.5.3";
export type { Env } from "jsr:@hono/hono@^4.5.3/types";

export { serveStatic, upgradeWebSocket } from "jsr:@hono/hono@^4.5.3/deno";
export interface PageData {
  page: Page;
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
