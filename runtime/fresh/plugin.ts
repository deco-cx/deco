import "../../utils/patched_fetch.ts";

import type { MiddlewareHandler, Plugin } from "$fresh/server.ts";
import type {
  Handler,
  HandlerContext,
  Handlers,
  PluginRoute,
} from "$fresh/src/server/types.ts";
import type { ImportMap } from "../../blocks/app.ts";
import { buildDecoState } from "./middlewares/3_stateBuilder.ts";

import type { DecofileProvider } from "../../engine/decofile/provider.ts";
import {
  type AppManifest,
  type DecoSiteState,
  type DecoState,
  HttpError,
  logger,
  type SiteInfo,
} from "../../mod.ts";
import { liveness } from "./middlewares/0_liveness.ts";
import { contextProvider } from "./middlewares/1_contextProvider.ts";
import { alienRelease } from "./middlewares/2_alienRelease.ts";
import { handler as decodMiddleware } from "./middlewares/2_daemon.ts";
import { handler as decoMiddleware } from "./middlewares/4_main.ts";

import { mapObjKeys } from "deco/engine/core/utils.ts";
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
import { handler as renderHandler } from "./routes/render.tsx";
import { handler as workflowHandler } from "./routes/workflow.ts";

export interface InitOptions<TManifest extends AppManifest = AppManifest> {
  manifest: TManifest;
  importMap?: ImportMap;
  site?: SiteInfo;
  useLocalStorageOnly?: boolean;
  release?: DecofileProvider;
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

/**
 * Wraps any route with an error handler that catches http-errors and returns the response accordingly.
 * Additionally logs the exception when running in a deployment.
 *
 * Ideally, this should be placed inside the `_middleware.ts` but fresh handles exceptions and wraps it into a 500-response before being catched by the middleware.
 * See more at: https://github.com/denoland/fresh/issues/586
 */
const withErrorHandler = (
  routePath: string,
  handler: Handler<any, any>,
): Handler<any, any> => {
  return async (req: Request, ctx: HandlerContext<any>) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) {
        return err.resp;
      }
      console.error(`route error ${routePath}: ${err}`);
      logger.error(`route ${routePath}: ${err?.stack}`);
      throw err;
    }
  };
};

/**
 * Unfortunately fresh does not accept one route for catching all non-matched routes.
 * It can be done using routeOverride (/*) but the internal fresh sort will break and this route will not be properly sorted.
 * So we're replicating the same handler for index.tsx as well, as a consequence of that, we need to manually convert the route name to [...catchall].tsx to avoid having two different configurations for each.
 */
const indexTsxToCatchAll: Record<string, string> = {
  "/index": "./routes/[...catchall].tsx",
  "/[...catchall]": "./routes/[...catchall].tsx",
  "./routes/index.tsx": "./routes/[...catchall].tsx",
};

export const injectLiveStateForPath = (
  path: string,
  handlers: Handler<any, any> | Handlers<any, any> | undefined,
): Handler<any, any> | Handlers<any, any> => {
  if (typeof handlers === "object") {
    return mapObjKeys(handlers, (val) => {
      return withErrorHandler(path, async function (
        request: Request,
        context: HandlerContext<any, DecoState<any, DecoSiteState>>,
      ) {
        const $live = await context?.state?.resolve?.(
          indexTsxToCatchAll[path] ?? path,
          { nullIfDangling: true },
        ); // middleware should be executed first.
        context.state.$live = $live;

        return val!(request, context);
      });
    });
  }
  return withErrorHandler(path, async function (
    request: Request,
    context: HandlerContext<any, DecoState<any, DecoSiteState>>,
  ) {
    const $live = (await context?.state?.resolve?.(
      indexTsxToCatchAll[path] ?? path,
      { nullIfDangling: true },
    )) ?? {};

    if (typeof handlers === "function") {
      context.state.$live = $live;

      return await handlers(request, context);
    }
    return await context.render($live);
  });
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
            liveness,
            ctxProvider,
            decodMiddleware,
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
