import "../../utils/patched_fetch.ts";
import { liveness } from "../htmx/middlewares/0_liveness.ts";
import type { Hono, MiddlewareHandler } from "./deps.ts";
import type { DecoHandler, DecoRouteState } from "./middleware.ts";

import { buildDecoState } from "../htmx//middlewares/3_stateBuilder.ts";

import { type AppManifest, Context } from "../../mod.ts";
import { contextProvider } from "../htmx/middlewares/1_contextProvider.ts";
import { alienRelease } from "../htmx/middlewares/2_alienRelease.ts";
import { handler as decod } from "../htmx/middlewares/2_daemon.ts";
import { handler as main } from "../htmx/middlewares/4_main.ts";

import type { ComponentType } from "preact";
import { join } from "std/path/join.ts";
import type { PageParams } from "../app.ts";
import { handler as metaHandler } from "../htmx/routes/_meta.ts";
import { handler as invokeHandler } from "../htmx/routes/batchInvoke.ts";
import {
    default as PreviewPage,
    handler as previewHandler,
} from "../htmx/routes/blockPreview.tsx";
import {
    default as Render,
    handler as entrypoint,
} from "../htmx/routes/entrypoint.tsx";
import { handler as inspectHandler } from "../htmx/routes/inspect.ts";
import { handler as invokeKeyHandler } from "../htmx/routes/invoke.ts";
import {
    default as PreviewsPage,
    handler as previewsHandler,
} from "../htmx/routes/previews.tsx";
import { handler as releaseHandler } from "../htmx/routes/release.ts";
import { handler as renderHandler } from "../htmx/routes/render.tsx";
import { styles } from "../htmx/routes/styles.css.ts";
import { handler as workflowHandler } from "../htmx/routes/workflow.ts";
import { rendererOf } from "./Renderer.tsx";
import { serveStatic, upgradeWebSocket } from "./deps.ts";

const DEV_SERVER_PATH = `/deco/dev`;
const DEV_SERVER_SCRIPT = (
    <script
        dangerouslySetInnerHTML={{
            __html: `
// Debounce function to limit the rate of page refreshes
function debounce(func, delay) {
let timeoutId;
return function(...args) {
if (timeoutId) clearTimeout(timeoutId);
timeoutId = setTimeout(() => func.apply(null, args), delay);
};
}

// Function to refresh the page
function refreshPage() {
window.location.reload();
}

// Debounced version of refreshPage
const debouncedRefresh = debounce(refreshPage, 100);

// Function to set up the WebSocket and listen for messages
function setupWebSocket() {
// Construct WebSocket URL based on current domain and protocol
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const host = window.location.host;
const path = '${DEV_SERVER_PATH}';
const wsUrl = \`\${protocol}//\${host}\${path}\`;

// Create a WebSocket connection
const socket = new WebSocket(wsUrl);

// Add an event listener for messages
socket.addEventListener('message', function(event) {
// Call the debounced function to refresh the page
debouncedRefresh();
});

// Handle errors
socket.addEventListener('error', function(error) {
console.error('WebSocket Error:', error);
});

// Clean up the WebSocket connection when the page is unloaded
window.addEventListener('beforeunload', function() {
socket.close();
});
}

// Run the setup function when the page loads
window.onload = setupWebSocket;
`,
        }}
    >
    </script>
);
export let binaryId = crypto.randomUUID();
let socket: null | WebSocket = null;
const routes: Array<
    {
        paths: string[];
        handler: DecoHandler;
        Component?: ComponentType<PageParams>;
    }
> = [
    {
        paths: ["/styles.css"],
        handler: styles,
    },
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
        `file://${join(Deno.cwd(), "manifest.gen.ts")}`
    ).then((mod) => mod.default);
    hono.use(
        liveness,
        contextProvider({ manifest }),
        alienRelease,
        decod,
        buildDecoState(),
        ...main,
    );
    hono.get(
        DEV_SERVER_PATH,
        upgradeWebSocket(() => {
            return {
                onOpen: (_, ws) => {
                    socket = ws.raw as WebSocket ?? null;
                },
                onClose: () => {
                    socket = null;
                },
            };
        }),
    );
    const staticHandlers: Record<string, MiddlewareHandler> = {};
    for (const { paths, handler, Component } of routes) {
        for (const path of paths) {
            hono.all(path, (ctx, next) => {
                const s = new URL(ctx.req.url);

                if (s.searchParams.has("__frsh_c")) {
                    staticHandlers[ctx.req.path] ??= serveStatic({
                        root: "static/",
                    });
                    return staticHandlers[ctx.req.path](
                        ctx,
                        next,
                    );
                }
                if (Component) {
                    ctx.setRenderer(
                        rendererOf(ctx.req.raw, ctx.req.param(), (props) => {
                            const active = Context.active();
                            return (
                                <>
                                    {!active.isDeploy
                                        ? DEV_SERVER_SCRIPT
                                        : null}
                                    <Component {...props} />
                                </>
                            );
                        }),
                    );
                }
                // deno-lint-ignore no-explicit-any
                return handler(ctx as any, next);
            });
        }
    }
};

addEventListener("hmr", () => {
    binaryId = crypto.randomUUID();
    if (socket) {
        socket.send("refresh");
    }
});
