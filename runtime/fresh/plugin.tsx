// TODO make fresh plugin use @deco/deco from JSR. so that we can use the same code for both

import type { Plugin } from "$fresh/server.ts";
import type { AppManifest, DecoContext, Framework, SiteInfo } from "@deco/deco";
import { Deco, type PageData, type PageParams } from "@deco/deco";
import { framework as htmxFramework } from "@deco/deco/htmx";
import type { ComponentType } from "preact";
import type { Bindings } from "../handler.tsx";
import freshFramework from "./Bindings.tsx";
export type { Plugin } from "$fresh/server.ts";

export interface PluginRoute {
  /** A path in the format of a filename path without filetype */
  path: string;

  component?:
    // deno-lint-ignore no-explicit-any
    ComponentType<any>;

  handler?: (
    req: Request,
    ctx: {
      render: (data: unknown) => Promise<Response> | Response;
      // deno-lint-ignore no-explicit-any
      state: any;
    },
  ) => Promise<Response> | Response;
}

export interface PluginMiddleware {
  path: string;
  middleware: Middleware;
}

export interface Middleware {
  handler: MiddlewareHandler | MiddlewareHandler[];
}

export type MiddlewareHandler = (
  req: Request,
  ctx: {
    next: () => Promise<Response>;
    // deno-lint-ignore no-explicit-any
    state: any;
    params: Record<string, string>;
  },
) => Promise<Response>;

export interface InitOptions<TManifest extends AppManifest = AppManifest> {
  manifest?: TManifest;
  htmx?: boolean;
  site?: SiteInfo;
  deco?: Deco<TManifest>;
  ErrorFallback?: Framework["ErrorFallback"];
  useServer?: Bindings<TManifest>["useServer"];
  middlewares?: PluginMiddleware[];
  visibilityOverrides?: DecoContext<TManifest>["visibilityOverrides"];
}

export type Options<TManifest extends AppManifest = AppManifest> =
  | InitOptions<TManifest>
  | OptionsProvider<TManifest>;

export type OptionsProvider<TManifest extends AppManifest = AppManifest> = (
  req: Request,
) => Promise<InitOptions<TManifest>>;

export const component = ({ data }: PageParams<PageData>) => {
  return <data.page.Component {...data.page.props} />;
};

export function createFreshHandler<M extends AppManifest = AppManifest>(
  deco: Deco<M>,
) {
  const h: PluginRoute["handler"] = (req: Request, ctx) => {
    return deco.handler(req, {
      RENDER_FN: ctx.render.bind(ctx),
      GLOBALS: ctx.state.global,
    });
  };
  return h;
}

export default function decoPlugin<TManifest extends AppManifest = AppManifest>(
  opt: Options<TManifest>,
): Plugin {
  if (typeof opt === "function") {
    throw new Error(`functions opts are not supported`);
  }

  const framework = opt?.htmx ? htmxFramework : freshFramework;

  const decoPromise = opt.deco instanceof Deco ? opt.deco : Deco.init({
    manifest: opt.manifest,
    site: opt?.site?.name,
    namespace: opt?.site?.namespace,
    bindings: {
      framework: {
        ...framework,
        ErrorFallback: opt.ErrorFallback ?? framework.ErrorFallback,
      },
      useServer: opt?.useServer,
    },
    visibilityOverrides: opt.visibilityOverrides,
  });

  const catchAll: PluginRoute = {
    path: "/[...catchall]",
    component,
    handler: async (req: Request, ctx) => {
      const deco = await decoPromise;
      return createFreshHandler(deco)(req, ctx);
    },
  };
  return {
    name: "deco",
    middlewares: opt.middlewares,
    routes: [
      catchAll,
      { ...catchAll, path: "/index" },
    ],
    islands: {
      baseLocation: import.meta.url,
      paths: ["./islands/DispatchAsyncRender.tsx"],
    },
  };
}
