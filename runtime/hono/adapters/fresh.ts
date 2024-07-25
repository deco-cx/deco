import type { MiddlewareHandler } from "$fresh/server.ts";
import { Context } from "@hono/hono";
import type { AppManifest } from "../../../mod.ts";
import type { DecoMiddleware } from "../middleware.ts";

export const asFreshMiddleware = <
  TAppManifest extends AppManifest = AppManifest,
>(mid: DecoMiddleware<TAppManifest>): MiddlewareHandler => {
  return async (req, ctx) => {
    // @ts-ignore: typings are wrong.
    const middlewareContext = new Context(req);
    await mid(middlewareContext, async () => {
      middlewareContext.res = await ctx.next();
    });
    ctx.state = middlewareContext.var;
    return middlewareContext.res;
  };
};
