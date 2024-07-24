import type { MiddlewareHandler } from "@hono/hono/types";
import type { AppManifest, DecoSiteState, DecoState } from "../../../mod.ts";
import type { DecoMiddleware } from "../middleware.ts";

export const asHonoMiddleware = <
    TAppManifest extends AppManifest = AppManifest,
>(mid: DecoMiddleware<TAppManifest>): MiddlewareHandler => {
    return async (ctx, next) => {
        // deno-lint-ignore no-explicit-any
        const state = {} as DecoState<any, DecoSiteState, TAppManifest>;
        const response = await mid({
            req: ctx.req.raw,
            next: async () => {
                await next();
                return ctx.res;
            },
            get state() {
                return state;
            },
            set state(value) {
                Object.assign(state, value);
            },
        });
        ctx.set("state", state);
        return response;
    };
};
