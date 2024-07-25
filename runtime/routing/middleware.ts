// deno-lint-ignore-file no-explicit-any
import type { Context } from "@hono/hono";
import type { Handler, Input, MiddlewareHandler } from "@hono/hono/types";
import {
    type AppManifest,
    type DecoSiteState,
    type DecoState,
    HttpError,
    logger,
} from "../../mod.ts";
declare module "@hono/hono" {
    interface ContextRenderer {
        <T>(data: T): Promise<Response>;
    }
}
export type DecoRouteState<TManifest extends AppManifest = AppManifest> = {
    Variables: DecoState<any, DecoSiteState, TManifest>;
    Bindings: object;
};
export type DecoHandler<TManifest extends AppManifest = AppManifest> = Handler<
    DecoRouteState<TManifest>
>;
export type DecoMiddlewareContext<
    TManifest extends AppManifest = AppManifest,
    P extends string = any,
    // deno-lint-ignore ban-types
    I extends Input = {},
> = Context<DecoRouteState<TManifest>, P, I>;

export type DecoMiddleware<TManifest extends AppManifest = AppManifest> =
    MiddlewareHandler<
        DecoRouteState<TManifest>
    >;

export const compose = <
    TManifest extends AppManifest,
>(
    ...middlewares: DecoMiddleware<TManifest>[]
): DecoMiddleware<TManifest> => {
    const last = middlewares[middlewares.length - 1];
    return async function (ctx, next) {
        // last called middleware #
        let index = -1;
        return await dispatch(0);
        async function dispatch(
            i: number,
        ): Promise<void> {
            if (i <= index) {
                return Promise.reject(
                    new Error("next() called multiple times"),
                );
            }
            index = i;
            const resolver = middlewares[i];
            if (i === middlewares.length) {
                await last(ctx, next);
                return;
            }
            await resolver(ctx, dispatch.bind(null, i + 1));
        }
    };
};

export const createMiddleware = <TManifest extends AppManifest = AppManifest>(
    ...mid: DecoMiddleware<TManifest>[]
): DecoMiddleware<TManifest> => compose(...mid);

export const createHandler = <TManifest extends AppManifest = AppManifest>(
    handler: DecoHandler<TManifest>,
): DecoHandler<TManifest> =>
async (ctx, next) => {
    try {
        return await handler(ctx, next);
    } catch (err) {
        if (err instanceof HttpError) {
            return err.resp;
        }
        console.error(`route error ${ctx.req.routePath}: ${err}`);
        logger.error(`route ${ctx.req.routePath}: ${err?.stack}`);
        throw err;
    }
};
