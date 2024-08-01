export { Hono } from "jsr:@hono/hono@^4.5.1";
export type {
  Context,
  Handler,
  Input,
  MiddlewareHandler
} from "jsr:@hono/hono@^4.5.1";
export type { Env } from "jsr:@hono/hono@^4.5.1/types";

export { serveStatic, upgradeWebSocket } from "jsr:@hono/hono@^4.5.1/deno";

declare module "jsr:@hono/hono@^4.5.1" {
  interface ContextRenderer {
    <T = unknown>(data: T): Promise<Response> | Response;
  }
}
