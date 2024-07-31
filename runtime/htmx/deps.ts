export type {
    Context,
    Handler,
    Input,
    MiddlewareHandler
} from "jsr:@hono/hono@^4.5.1";

export { Hono } from "jsr:@hono/hono@^4.5.1";

export { serveStatic, upgradeWebSocket } from "jsr:@hono/hono@^4.5.1/deno";

declare module "jsr:@hono/hono@^4.5.1" {
    interface ContextRenderer {
        <T>(data: T): Promise<Response> | Response;
    }
}
