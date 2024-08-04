import type { ComponentChildren, ComponentType } from "preact";
import type { AppManifest } from "../mod.ts";
import "../utils/patched_fetch.ts";
import type { Deco } from "./app.ts";
import { type ContextRenderer, Hono } from "./deps.ts";

import type { DecoHandler, DecoRouteState } from "./middleware.ts";
import { middlewareFor } from "./middleware.ts";
import { handler as metaHandler } from "./routes/_meta.ts";
import { handler as invokeHandler } from "./routes/batchInvoke.ts";
import { handler as previewHandler } from "./routes/blockPreview.tsx";
import { handler as entrypoint } from "./routes/entrypoint.tsx";
import { handler as inspectHandler } from "./routes/inspect.ts";
import { handler as invokeKeyHandler } from "./routes/invoke.ts";
import { handler as previewsHandler } from "./routes/previews.tsx";
import { handler as releaseHandler } from "./routes/release.ts";
import { handler as renderHandler } from "./routes/render.tsx";
import { styles } from "./routes/styles.css.ts";
import { handler as workflowHandler } from "./routes/workflow.ts";

export interface RendererOpts {
  Layout?: ComponentType<
    { req: Request; children: ComponentChildren; revision: string }
  >;
  renderFn?: ContextRenderer;
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
  },
  {
    paths: ["/live/previews/*", "/deco/previews/*"],
    handler: previewHandler,
  },
  {
    paths: ["/live/workflows/run", "/deco/workflows/run"],
    handler: workflowHandler,
  },
  {
    paths: ["/deco/render"],
    handler: renderHandler,
  },
  {
    paths: ["/", "*"],
    handler: entrypoint,
  },
];

export const handlerFor = <TAppManifest extends AppManifest = AppManifest>(
  deco: Deco<TAppManifest>,
): (
  req: Request,
  bindings?: DecoRouteState<TAppManifest>["Bindings"],
) => Promise<Response> | Response => {
  const bindings = deco.bindings;
  const hono = bindings?.server ?? new Hono<DecoRouteState<TAppManifest>>();
  hono.use(async (ctx, next) => {
    const renderFn = ctx.env.RENDER_FN ?? bindings?.renderer?.renderFn;
    renderFn && ctx.setRenderer(
      renderFn,
    );
    await next();
  });
  hono.use(...middlewareFor(deco));
  for (const { paths, handler } of routes) {
    for (const path of paths) {
      hono.all(path, handler);
    }
  }
  return hono.fetch.bind(hono);
};
