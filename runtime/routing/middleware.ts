import type { AppManifest, DecoSiteState, DecoState } from "../../mod.ts";

export interface DecoMiddlewareContext<
    TManifest extends AppManifest = AppManifest,
> {
    next: () => Promise<Response>;
    req: Request;
    // deno-lint-ignore no-explicit-any
    state: DecoState<any, DecoSiteState, TManifest>;
}
export type DecoMiddleware<TManifest extends AppManifest = AppManifest> = (
    ctx: DecoMiddlewareContext<TManifest>,
) => Promise<Response>;

export const compose = <
    TManifest extends AppManifest,
>(
    ...middlewares: DecoMiddleware<TManifest>[]
): DecoMiddleware<TManifest> => {
    const last = middlewares[middlewares.length - 1];
    return async function (ctx: DecoMiddlewareContext<TManifest>) {
        // last called middleware #
        let index = -1;
        return await dispatch(0);
        async function dispatch(
            i: number,
        ): Promise<Response> {
            if (i <= index) {
                return Promise.reject(
                    new Error("next() called multiple times"),
                );
            }
            index = i;
            const resolver = middlewares[i];
            if (i === middlewares.length) {
                return await last(ctx);
            }
            return await resolver({
                ...ctx,
                next: dispatch.bind(null, i + 1),
            });
        }
    };
};

export const createMiddleware = <TManifest extends AppManifest = AppManifest>(
    ...mid: DecoMiddleware<TManifest>[]
): DecoMiddleware<TManifest> => compose(...mid);
