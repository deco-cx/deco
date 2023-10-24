import { MiddlewareHandler, Plugin } from "$fresh/server.ts";
import { SourceMap } from "../blocks/app.ts";
import { buildDecoState, injectLiveStateForPath } from "../blocks/route.ts";
import { newFsProvider } from "../engine/releases/fs.ts";
import { Release } from "../engine/releases/provider.ts";
import { AppManifest, createResolver, SiteInfo } from "../mod.ts";
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
import { handler as renderHandler } from "../routes/deco/render.ts";

export interface Options<TManifest extends AppManifest = AppManifest> {
  manifest: TManifest;
  sourceMap?: SourceMap;
  site?: SiteInfo;
  useLocalStorageOnly?: boolean;
  release?: Release;
}
export default function decoPlugin(opt?: Options): Plugin {
  let buildDecoStateMiddl = buildDecoState("./routes/_middleware.ts");
  if (opt) {
    const releaseProvider =
      opt?.useLocalStorageOnly || Deno.env.has("USE_LOCAL_STORAGE_ONLY")
        ? newFsProvider(".release.json", opt.manifest.name)
        : opt.release;
    buildDecoStateMiddl = buildDecoState(createResolver(
      {
        baseUrl: opt.manifest.baseUrl,
        name: opt.manifest.name,
        apps: { ...opt.manifest.apps },
      },
      opt.sourceMap,
      releaseProvider,
    ));
  }
  return {
    name: "deco",
    middlewares: [
      {
        path: "/",
        middleware: {
          handler: [
            buildDecoStateMiddl,
            ...decoMiddleware,
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
      {
        path: "/deco/render",
        handler: renderHandler,
        component: Render,
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
