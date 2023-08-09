import { MiddlewareHandler, Plugin } from "$fresh/server.ts";
import { buildDecoState, injectLiveStateForPath } from "$live/blocks/route.ts";
import {
  default as Render,
  handler as entrypoint,
} from "$live/routes/[...catchall].tsx";
import { handler as decoMiddleware } from "$live/routes/_middleware.ts";
import { handler as metaHandler } from "$live/routes/live/_meta.ts";
import { handler as editorDataHandler } from "$live/routes/live/editorData.ts";
import { handler as inspectHandler } from "$live/routes/live/inspect/[...block].ts";
import { handler as invokeKeyHandler } from "$live/routes/live/invoke/[...key].ts";
import { handler as invokeHandler } from "$live/routes/live/invoke/index.ts";
import {
  default as PreviewPage,
  handler as previewHandler,
} from "$live/routes/live/previews/[...block].tsx";
import { default as PreviewsPage } from "$live/routes/live/previews/index.tsx";
import { handler as releaseHandler } from "$live/routes/live/release.ts";
import { handler as workbenchHandler } from "$live/routes/live/workbench.ts";
import { handler as workflowHandler } from "$live/routes/live/workflows/run.ts";
import { AppManifest, SiteInfo } from "$live/mod.ts";

export interface Options<TManifest extends AppManifest = AppManifest> {
  manifest: TManifest;
  site: SiteInfo;
  useLocalStorageOnly?: boolean;
}
export default function decoPlugin(opt?: Options): Plugin {
  return {
    name: "deco",
    middlewares: [
      {
        path: "/",
        middleware: {
          handler: [
            buildDecoState,
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
        path: "/workflows/run",
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
