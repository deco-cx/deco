import type { AppManifest, SiteInfo } from "../../types.ts";

import type { ComponentType } from "preact";
import type { PageData } from "../deps.ts";
import htmxFramework from "../htmx/Bindings.tsx";
import { Deco, type PageParams } from "../mod.ts";
import framework from "./Bindings.tsx";

export interface Plugin {
  name: string;
  routes?: PluginRoute[];
  middlewares?: PluginMiddleware[];
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
    next: () => Promise<Response | undefined>;
    // deno-lint-ignore no-explicit-any
    state: any;
    params: Record<string, string>;
  },
) => Promise<Response | undefined>;

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

export interface InitOptions<TManifest extends AppManifest = AppManifest> {
  manifest?: TManifest;
  htmx?: boolean;
  site?: SiteInfo;
  deco?: Deco<TManifest>;
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

export function createFreshHandler(deco: Deco) {
  const h: PluginRoute["handler"] = (req: Request, ctx) => {
    return deco.handler(req, {
      RENDER_FN: ctx.render.bind(ctx),
      GLOBALS: ctx.state,
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

  const decoPromise = opt.deco instanceof Deco ? opt.deco : Deco.init({
    manifest: opt.manifest,
    site: opt?.site?.name,
    namespace: opt?.site?.namespace,
    bindings: { framework: opt?.htmx ? htmxFramework : framework },
  });

  const catchAll: PluginRoute = {
    path: "/[...catchall]",
    component,
    handler: (req: Request, ctx) =>
      createFreshHandler(ctx.state.deco)(req, ctx),
  };
  return {
    name: "deco",
    middlewares: [
      {
        path: "/",
        middleware: {
          handler: async (req: Request, ctx) => {
            const deco = await decoPromise;

            Object.assign(
              ctx.state,
              await deco.prepareState({
                req: { raw: req, param: () => ctx.params },
              }),
            );

            return await ctx.next();
          },
        },
      },
    ],
    routes: [
      catchAll,
      { ...catchAll, path: "/index" },
    ],
  };
}
