import "../../utils/patched_fetch.ts";

import type { Plugin, PluginRoute } from "$fresh/server.ts";

import { type AppManifest, Deco, type SiteInfo } from "../../mod.ts";

import type { PageData } from "../deps.ts";
import type { PageParams } from "../mod.ts";

export interface InitOptions<TManifest extends AppManifest = AppManifest> {
  manifest: TManifest;
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
