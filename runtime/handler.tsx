import { rendererOf } from "deco/runtime/htmx/Renderer.tsx";
import type { ComponentType } from "preact";
import { type AppManifest, Context } from "../mod.ts";
import "../utils/patched_fetch.ts";
import type { Deco, PageParams } from "./app.ts";
import {
    Hono,
    MiddlewareHandler,
    serveStatic,
    upgradeWebSocket,
} from "./deps.ts";
import type { DecoHandler, DecoRouteState } from "./middleware.ts";
import { middlewareFor } from "./middleware.ts";
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
import { styles } from "./routes/styles.css.ts";
import { handler as workflowHandler } from "./routes/workflow.ts";

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
let binaryId = crypto.randomUUID();
let socket: null | WebSocket = null;

export interface RendererOpts {
    wrapper?: ComponentType<{ req: Request; children: ComponentType }>;
    rendererOf: (
        req: Request,
        params: Record<string, string>,
        Component: ComponentType<PageParams>,
    ) => <TData = unknown>(data: TData) => Promise<Response> | Response;
}

export interface HandlerOpts {
    renderer?: RendererOpts;
}

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

export const handlerFor = <TAppManifest extends AppManifest = AppManifest>(
    deco: Deco<TAppManifest>,
    opts?: HandlerOpts,
): (req: Request) => Promise<Response> | Response => {
    const hono = new Hono<DecoRouteState<TAppManifest>>();
    hono.use(...middlewareFor(deco));
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
    return hono.fetch.bind(hono);
};

addEventListener("hmr", () => {
    binaryId = crypto.randomUUID();
    socket && socket.send("refresh");
});
