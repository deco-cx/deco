import { MiddlewareHandler, Plugin } from "$fresh/server.ts";
import { buildDecoState, injectLiveStateForPath } from "../blocks/route.ts";
import defaults from "../engine/fresh/defaults.ts";
import { $live, AppManifest, SiteInfo } from "../mod.ts";
import {
  default as Render,
  handler as entrypoint,
} from "../routes/[...catchall].tsx";
import { handler as decoMiddleware } from "../routes/_middleware.ts";
import { handler as metaHandler } from "../routes/live/_meta.ts";
import { handler as editorDataHandler } from "../routes/live/editorData.ts";
import { handler as inspectHandler } from "../routes/live/inspect/[...block].ts";
import { handler as invokeKeyHandler } from "../routes/live/invoke/[...key].ts";
import { handler as invokeHandler } from "../routes/live/invoke/index.ts";
import {
  default as PreviewPage,
  handler as previewHandler,
} from "../routes/live/previews/[...block].tsx";
import { default as PreviewsPage } from "../routes/live/previews/index.tsx";
import { handler as releaseHandler } from "../routes/live/release.ts";
import { handler as workbenchHandler } from "../routes/live/workbench.ts";
import { handler as workflowHandler } from "../routes/live/workflows/run.ts";

export interface Options<TManifest extends AppManifest = AppManifest> {
  manifest: TManifest;
  site: SiteInfo;
  useLocalStorageOnly?: boolean;
}
export default function decoPlugin(opt?: Options): Plugin {
  if (opt) {
    $live(
      {
        baseUrl: opt.manifest.baseUrl,
        name: opt.manifest.name,
        apps: { ...opt.manifest.apps },
      },
      opt.site,
      opt.useLocalStorageOnly,
    );
  }
  return {
    name: "deco",
    middlewares: [
      {
        path: "/",
        middleware: {
          handler: [
            buildDecoState(
              opt
                ? {
                  __resolveType: defaults["bootstrap"].name,
                }
                : "./routes/_middleware.ts",
            ),
            decoMiddleware,
          ] as MiddlewareHandler<Record<string, unknown>>[],
        },
      },
    ],
    routes: [
      {
        path: "/index",
        handler: entrypoint,
        component: Render,
      },
      {
        path: "/[...catchall]",
        handler: entrypoint,
        component: Render,
      },
      {
        path: "/live/_meta",
        handler: metaHandler,
      },
      {
        path: "/live/editorData",
        handler: editorDataHandler,
      },
      {
        path: "/live/release",
        handler: releaseHandler,
      },
      {
        path: "/live/workbench",
        handler: workbenchHandler,
      },
      {
        path: "/live/inspect/[...block]",
        handler: inspectHandler,
      },
      {
        path: "/live/invoke/index",
        handler: invokeHandler,
      },
      {
        path: "/live/invoke/[...key]",
        handler: invokeKeyHandler,
      },
      {
        path: "/live/previews/index",
        component: PreviewsPage,
      },
      {
        path: "/live/previews/[...block]",
        component: PreviewPage,
        handler: previewHandler,
      },
      {
        path: "/live/workflows/run",
        handler: workflowHandler,
      },
    ].map((route) => {
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
