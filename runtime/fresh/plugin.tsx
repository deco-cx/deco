import type { AppManifest, SiteInfo } from "../../types.ts";

import type { ComponentType } from "preact";
import type { PageData } from "../deps.ts";
import htmxFramework from "../htmx/Bindings.tsx";
import { Deco, type PageParams } from "../mod.ts";
import framework from "./Bindings.tsx";

export interface Plugin {
  name: string;
  routes?: PluginRoute[];
}

export interface PluginRoute {
  /** A path in the format of a filename path without filetype */
  path: string;

  component?:
    // deno-lint-ignore no-explicit-any
    ComponentType<any>;

  handler?: (
    req: Request,
    ctx: { render: (data: unknown) => Promise<Response> | Response },
  ) => Promise<Response> | Response;
}

export interface InitOptions<TManifest extends AppManifest = AppManifest> {
  manifest: TManifest;
  htmx?: boolean;
  site?: SiteInfo;
}

export type Options<TManifest extends AppManifest = AppManifest> =
  | InitOptions<TManifest>
  | OptionsProvider<TManifest>;

export type OptionsProvider<TManifest extends AppManifest = AppManifest> = (
  req: Request,
) => Promise<InitOptions<TManifest>>;

export default function decoPlugin(opt: Options): Plugin {
  if (typeof opt === "function") {
    throw new Error(`functions opts are not supported`);
  }
  const handlerPromise = Deco.init({
    manifest: opt.manifest,
    site: opt?.site?.name,
    namespace: opt?.site?.namespace,
    bindings: { framework: opt?.htmx ? htmxFramework : framework },
  }).then((deco) => deco.handler.bind(deco));

  const catchAll: PluginRoute = {
    path: "/[...catchall]",
    component: ({ data }: PageParams<PageData>) => {
      return <data.page.Component {...data.page.props} />;
    },
    handler: async (req: Request, ctx) => {
      const hdnl = await handlerPromise;
      return hdnl(req, {
        RENDER_FN: ctx.render.bind(ctx),
      });
    },
  };
  return {
    name: "deco",
    routes: [
      catchAll,
      { ...catchAll, path: "/index" },
    ],
  };
}
