/** @jsxRuntime automatic */
/** @jsxImportSource preact */

/**
 * Fresh 2 Middleware Adapter for Deco
 *
 * This module provides a Fresh 2 compatible middleware that wraps
 * deco's Hono-based handler. Fresh 2 uses a different middleware
 * signature than Fresh 1.x:
 *
 * Fresh 1.x: (req, { next, state }) => Response
 * Fresh 2:   (ctx) => ctx.next()
 *
 * Additionally, Fresh 2 changed ctx.render():
 * Fresh 1.x: ctx.render(data) - passed data as props to component
 * Fresh 2:   ctx.render(<Component {...props} />) - must pass JSX element
 */

import type { ComponentChildren, VNode } from "preact";
import type { AppManifest, DecoContext, Framework, SiteInfo } from "@deco/deco";
import { Deco, type PageData } from "@deco/deco";
import { framework as htmxFramework } from "@deco/deco/htmx";
import type { Bindings, RendererOpts } from "../handler.tsx";
import { handlerFor } from "../handler.tsx";
import freshFramework from "./Bindings.tsx";

/**
 * Fresh 2 render function type - expects JSX element
 */
type Fresh2RenderFn = (element: VNode | ComponentChildren) => Promise<Response> | Response;

/**
 * Fresh 2 context type (simplified - actual type comes from fresh)
 */
export interface FreshContext<State = unknown> {
  req: Request;
  url: URL;
  state: State;
  params: Record<string, string>;
  render: Fresh2RenderFn;
  next: () => Promise<Response>;
}

/**
 * Fresh 2 middleware handler type
 */
export type FreshMiddleware<State = unknown> = (
  ctx: FreshContext<State>,
) => Response | Promise<Response>;

export interface DecoFresh2Options<TManifest extends AppManifest = AppManifest> {
  manifest?: TManifest;
  htmx?: boolean;
  site?: SiteInfo;
  deco?: Deco<TManifest>;
  ErrorFallback?: Framework["ErrorFallback"];
  renderer?: RendererOpts;
  useServer?: Bindings<TManifest>["useServer"];
  visibilityOverrides?: DecoContext<TManifest>["visibilityOverrides"];
}

/**
 * Creates a Fresh 2 compatible middleware for deco.
 *
 * Usage in main.ts:
 * ```typescript
 * import { App, staticFiles } from "fresh";
 * import { decoMiddleware } from "deco/runtime/fresh/middleware.ts";
 * import manifest from "./manifest.gen.ts";
 *
 * const app = new App()
 *   .use(staticFiles())
 *   .use(await decoMiddleware({ manifest }));
 *
 * if (import.meta.main) {
 *   app.listen();
 * }
 * ```
 */
export async function decoMiddleware<
  TManifest extends AppManifest = AppManifest,
>(
  options: DecoFresh2Options<TManifest>,
): Promise<FreshMiddleware> {
  const framework = options?.htmx ? htmxFramework : freshFramework;

  const deco = options.deco instanceof Deco
    ? options.deco
    : await Deco.init({
      manifest: options.manifest,
      site: options?.site?.name,
      namespace: options?.site?.namespace,
      bindings: {
        framework: {
          ...framework,
          ErrorFallback: options.ErrorFallback ?? framework.ErrorFallback,
        },
        renderer: options.renderer,
        useServer: options?.useServer,
      },
      visibilityOverrides: options.visibilityOverrides,
    });

  const handler = handlerFor(deco);

  return async (ctx: FreshContext): Promise<Response> => {
    // Adapter: Convert deco's data-based render to Fresh 2's JSX-based render
    // Deco calls: renderFn({ page: { Component, props, metadata } })
    // Fresh 2 expects: ctx.render(<Component {...props} />)
    const renderAdapter = <T extends PageData = PageData>(data: T): Promise<Response> | Response => {
      const { Component, props } = data.page;
      // Call Fresh 2's render with JSX element
      return ctx.render(<Component {...props} />);
    };

    const response = await handler(ctx.req, {
      RENDER_FN: renderAdapter,
      GLOBALS: ctx.state,
    });

    return response;
  };
}

/**
 * Alternative: Create deco instance and return both the middleware and deco instance.
 * Useful when you need access to the deco instance for other purposes.
 */
export async function createDecoMiddleware<
  TManifest extends AppManifest = AppManifest,
>(
  options: DecoFresh2Options<TManifest>,
): Promise<{ middleware: FreshMiddleware; deco: Deco<TManifest> }> {
  const framework = options?.htmx ? htmxFramework : freshFramework;

  const deco = options.deco instanceof Deco
    ? options.deco
    : await Deco.init({
      manifest: options.manifest,
      site: options?.site?.name,
      namespace: options?.site?.namespace,
      bindings: {
        framework: {
          ...framework,
          ErrorFallback: options.ErrorFallback ?? framework.ErrorFallback,
        },
        renderer: options.renderer,
        useServer: options?.useServer,
      },
      visibilityOverrides: options.visibilityOverrides,
    });

  const handler = handlerFor(deco);

  const middleware: FreshMiddleware = async (ctx: FreshContext): Promise<Response> => {
    // Adapter: Convert deco's data-based render to Fresh 2's JSX-based render
    const renderAdapter = <T extends PageData = PageData>(data: T): Promise<Response> | Response => {
      const { Component, props } = data.page;
      return ctx.render(<Component {...props} />);
    };

    const response = await handler(ctx.req, {
      RENDER_FN: renderAdapter,
      GLOBALS: ctx.state,
    });

    return response;
  };

  return { middleware, deco };
}
