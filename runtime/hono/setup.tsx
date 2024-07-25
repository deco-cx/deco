import type { Hono } from "@hono/hono";
import "../../utils/patched_fetch.ts";
import type { DecoHandler, DecoRouteState } from "./middleware.ts";
import { liveness } from "./middlewares/0_liveness.ts";

import type { PageProps } from "$fresh/src/server/types.ts";
import { buildDecoState } from "./middlewares/3_stateBuilder.ts";

import type { AppManifest } from "../../mod.ts";
import { contextProvider } from "./middlewares/1_contextProvider.ts";
import { alienRelease } from "./middlewares/2_alienRelease.ts";
import { handler as decod } from "./middlewares/2_daemon.ts";
import { handler as main } from "./middlewares/4_main.ts";

import type { ComponentType } from "preact";
import { renderToString } from "preact-render-to-string";
import { join } from "std/path/join.ts";
import { handler as metaHandler } from "./routes/_meta.ts";
import { handler as invokeHandler } from "./routes/batchInvoke.ts";
import {
    default as PreviewPage,
    handler as previewHandler,
} from "./routes/blockPreview.tsx";
import {
    default as Render,
    handler as entrypoint,
} from "./routes/entrypoint.tsx";
import { handler as inspectHandler } from "./routes/inspect.ts";
import { handler as invokeKeyHandler } from "./routes/invoke.ts";
import {
    default as PreviewsPage,
    handler as previewsHandler,
} from "./routes/previews.tsx";
import { handler as releaseHandler } from "./routes/release.ts";
import { handler as renderHandler } from "./routes/render.tsx";
import { handler as workflowHandler } from "./routes/workflow.ts";

const routes: Array<
    {
        paths: string[];
        handler: DecoHandler;
        Component?: ComponentType<PageProps>;
    }
> = [
    {
        paths: ["/live/_meta", "/deco/meta"],
        handler: metaHandler,
    },
    {
        paths: ["/live/release", "/.decofile"],
        handler: releaseHandler,
    },
    {
        paths: ["/live/inspect/:block", "/deco/inspect/:block"],
        handler: inspectHandler,
    },
    {
        paths: ["/live/invoke", "/deco/invoke"],
        handler: invokeHandler,
    },
    {
        paths: ["/live/invoke/*", "/deco/invoke/*"],
        handler: invokeKeyHandler,
    },
    {
        paths: ["/live/previews", "/deco/previews"],
        handler: previewsHandler,
        Component: PreviewsPage,
    },
    {
        paths: ["/live/previews/*", "/deco/previews/*"],
        Component: PreviewPage,
        handler: previewHandler,
    },
    {
        paths: ["/live/workflows/run", "/deco/workflows/run"],
        handler: workflowHandler,
    },
    {
        paths: ["/deco/render"],
        handler: renderHandler,
        Component: Render,
    },
    {
        paths: ["/", "*"],
        handler: entrypoint,
        Component: Render,
    },
];

export type { DecoRouteState };
export const setup = async <
    TAppManifest extends AppManifest = AppManifest,
    THonoState extends DecoRouteState<TAppManifest> = DecoRouteState<
        TAppManifest
    >,
>(
    hono: Hono<THonoState>,
) => {
    const manifest = await import(
        import.meta.resolve(join(Deno.cwd(), "manifest.gen.ts"))
    ).then((mod) => mod.default);
    hono.use(
        liveness,
        contextProvider({ manifest }),
        alienRelease,
        decod,
        buildDecoState(),
        ...main,
    );
    for (const { paths, handler, Component } of routes) {
        for (const path of paths) {
            hono.all(path, (ctx, next) => {
                if (Component) {
                    ctx.setRenderer((data) => {
                        return Promise.resolve(
                            new Response(
                                renderToString(
                                    <Component
                                        params={ctx.req.param()}
                                        url={new URL(ctx.req.url)}
                                        data={data}
                                    />,
                                ),
                                {
                                    status: 200,
                                    headers: { "Content-Type": "text/html" },
                                },
                            ),
                        );
                    });
                }
                // deno-lint-ignore no-explicit-any
                return handler(ctx as any, next);
            });
        }
    }
};
