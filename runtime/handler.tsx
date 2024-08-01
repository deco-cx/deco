import type { ComponentChildren, ComponentType } from "preact";
import type { AppManifest } from "../mod.ts";
import "../utils/patched_fetch.ts";
import type { Deco, PageParams } from "./app.ts";
import type { ContextRenderer } from "./deps.ts";
import { Hono, type MiddlewareHandler, serveStatic } from "./deps.ts";
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

export interface RendererOpts {
  Layout?: ComponentType<
    { req: Request; children: ComponentChildren; revision: string }
  >;
  factory: (
    Component: ComponentType<Pick<PageParams, "data">>,
  ) => Promise<ContextRenderer> | ContextRenderer;
}

export interface Bindings<TAppManifest extends AppManifest = AppManifest> {
  renderer?: RendererOpts;
  server?: Hono<DecoRouteState<TAppManifest>>;
}

const routes: Array<
  {
    paths: string[];
    // deno-lint-ignore no-explicit-any
    handler: DecoHandler<any>;
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
): (req: Request) => Promise<Response> | Response => {
  const bindings = deco.bindings;
  const hono = bindings?.server ?? new Hono<DecoRouteState<TAppManifest>>();
  hono.use(...middlewareFor(deco));
  const staticHandlers: Record<string, MiddlewareHandler> = {};
  for (const { paths, handler, Component } of routes) {
    for (const path of paths) {
      hono.all(path, async (ctx, next) => {
        const reqUrl = ctx.var.url;

        if (reqUrl.searchParams.has("__frsh_c")) {
          staticHandlers[ctx.req.path] ??= serveStatic({
            root: "static/",
          });
          return staticHandlers[ctx.req.path](
            ctx,
            next,
          );
        }
        if (Component) {
          const renderer = await bindings?.renderer?.factory(
            (props) => {
              return (
                <Component
                  url={ctx.var.url}
                  params={ctx.req.param()}
                  {...props}
                />
              );
            },
          );
          renderer && ctx.setRenderer(
            renderer,
          );
        }
        return handler(ctx, next);
      });
    }
  }
  return hono.fetch.bind(hono);
};
