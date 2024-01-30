import { MiddlewareHandler, Plugin } from "$fresh/server.ts";
import { PluginRoute } from "$fresh/src/server/types.ts";
import { SourceMap } from "../../blocks/app.ts";
import {
  buildDecoState,
  injectLiveStateForPath,
} from "./middlewares/2_stateBuilder.ts";

import { Release } from "../../engine/releases/provider.ts";
import { AppManifest, SiteInfo } from "../../mod.ts";
import { contextProvider } from "./middlewares/0_contextProvider.ts";
import { alienRelease } from "./middlewares/1_alienRelease.ts";

import { handler as decoMiddleware } from "./middlewares/3_main.ts";
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
import { default as PreviewsPage } from "./routes/previews.tsx";
import { handler as releaseHandler } from "./routes/release.ts";
import { handler as renderHandler } from "./routes/render.ts";
import { handler as workflowHandler } from "./routes/workflow.ts";

export interface InitOptions<TManifest extends AppManifest = AppManifest> {
  manifest: TManifest;
  sourceMap?: SourceMap;
  site?: SiteInfo;
  useLocalStorageOnly?: boolean;
  release?: Release;
}

export type Options<TManifest extends AppManifest = AppManifest> =
  | InitOptions<TManifest>
  | OptionsProvider<TManifest>;

export type OptionsProvider<TManifest extends AppManifest = AppManifest> = (
  req: Request,
) => Promise<InitOptions<TManifest>>;
const noop: MiddlewareHandler = (_req, ctx) => {
  return ctx.next();
};

export default function decoPlugin(opt: Options): Plugin {
  const ctxProvider = Deno.args.includes("build") ? noop : contextProvider(opt);
  const routes: Array<
    {
      paths: string[];
      handler?: PluginRoute["handler"];
      component?: PluginRoute["component"];
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
      paths: ["/live/inspect/[...block]", "/deco/inspect/[...block]"],
      handler: inspectHandler,
    },
    {
      paths: ["/live/invoke/index", "/deco/invoke/index"],
      handler: invokeHandler,
    },
    {
      paths: ["/live/invoke/[...key]", "/deco/invoke/[...key]"],
      handler: invokeKeyHandler,
    },
    {
      paths: ["/live/previews/index", "/deco/previews/index"],
      component: PreviewsPage,
    },
    {
      paths: ["/live/previews/[...block]", "/deco/previews/[...block]"],
      component: PreviewPage,
      handler: previewHandler,
    },
    {
      paths: ["/live/workflows/run", "/deco/workflows/run"],
      handler: workflowHandler,
    },
    {
      paths: ["/deco/render", "/deco/render"],
      handler: renderHandler,
      component: Render,
    },
    {
      paths: ["/index", "/[...catchall]"],
      handler: entrypoint,
      component: Render,
    },
  ];
  return {
    name: "deco",
    middlewares: [
      {
        path: "/",
        middleware: {
          handler: [
            ctxProvider,
            alienRelease,
            buildDecoState(),
            ...decoMiddleware,
          ] as MiddlewareHandler<Record<string, unknown>>[],
        },
      },
    ],
    routes: routes.flatMap(({ paths, handler, component }) =>
      paths.map((path) => ({ path, handler, component }))
    ).map((route) => {
      if (!route.handler) {
        return route;
      }
      return {
        ...route,
        handler: injectLiveStateForPath(route.path, route.handler),
      };
    }),
  };
}
