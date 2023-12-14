import { MiddlewareHandler, Plugin } from "$fresh/server.ts";
import { PluginRoute } from "$fresh/src/server/types.ts";
import { SourceMap } from "../blocks/app.ts";
import { buildDecoState, injectLiveStateForPath } from "../blocks/route.ts";
import { DECO_FILE_NAME, newFsProvider } from "../engine/releases/fs.ts";
import { Release } from "../engine/releases/provider.ts";
import { AppManifest, SiteInfo, createResolver } from "../mod.ts";
import {
  default as Render,
  handler as entrypoint,
} from "../routes/[...catchall].tsx";
import { handler as decoMiddleware } from "../routes/_middleware.ts";
import { handler as renderHandler } from "../routes/deco/render.ts";
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
        ? newFsProvider(DECO_FILE_NAME, opt.manifest.name)
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
      paths: ["/live/editorData"],
      handler: editorDataHandler,
    },
    {
      paths: ["/live/release", "/.decofile"],
      handler: releaseHandler,
    },
    {
      paths: ["/live/workbench"],
      handler: workbenchHandler,
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
            buildDecoStateMiddl,
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
