import type { MiddlewareHandler } from "$fresh/server.ts";
import type { AppManifest, DecoSiteState, DecoState } from "../../../mod.ts";
import type { DecoMiddleware } from "../middleware.ts";

export const asFreshMiddleware = <
    TAppManifest extends AppManifest = AppManifest,
>(mid: DecoMiddleware<TAppManifest>): MiddlewareHandler => {
    return async (req, ctx) => {
        // deno-lint-ignore no-explicit-any
        const state = {} as DecoState<any, DecoSiteState, TAppManifest>;
        const response = await mid({
            req,
            next: () => ctx.next(),
            get state() {
                return state;
            },
            set state(value) {
                Object.assign(state, value);
            },
        });
        ctx.state = state;
        return response;
    };
};
