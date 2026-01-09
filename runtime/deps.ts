import type { Page } from "../blocks/page.tsx";
import { isDeno } from "../compat/mod.ts";

// Use standard hono package (works in Deno, Bun, and Node)
export { Hono } from "hono";
export type { Context, Handler, Input, MiddlewareHandler } from "hono";
export type { Env } from "hono/types";

// Deno-specific adapters - stub for other runtimes
export const serveStatic = isDeno
  // @ts-ignore - dynamic import for Deno
  ? (await import("@hono/hono/deno")).serveStatic
  : () => async () => new Response(null, { status: 404 });

export const upgradeWebSocket = isDeno
  // @ts-ignore - dynamic import for Deno
  ? (await import("@hono/hono/deno")).upgradeWebSocket
  : () => () => ({});
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
