/** @jsxRuntime automatic */
/** @jsxImportSource preact */
import "../utils/patched_fetch.ts";

import {
  type ComponentChildren,
  type ComponentType,
  createContext,
} from "preact";
import { useContext } from "preact/hooks";
import type { Framework } from "../components/section.tsx";
import type { AppManifest } from "../types.ts";
import "../utils/patched_fetch.ts";
import { Hono, type PageData } from "./deps.ts";
import { HTMX } from "./htmx/mod.tsx";
import type { DecoHandler, DecoRouteState, HonoHandler } from "./middleware.ts";
import { middlewareFor } from "./middleware.ts";
import type { Deco } from "./mod.ts";
import { handler as metaHandler } from "./routes/_meta.ts";
import { handler as invokeHandler } from "./routes/batchInvoke.ts";
import { handler as previewHandler } from "./routes/blockPreview.tsx";
import { handler as entrypoint } from "./routes/entrypoint.tsx";
import { handler as inspectHandler } from "./routes/inspect.ts";
import { handler as invokeKeyHandler } from "./routes/invoke.ts";
import { handler as previewsHandler } from "./routes/previews.tsx";
import { handler as releaseHandler } from "./routes/release.ts";
import { handler as renderHandler } from "./routes/render.tsx";
import { styles } from "./routes/styles.css.ts";
import { handler as workflowHandler } from "./routes/workflow.ts";
export interface RendererOpts {
  Layout?: ComponentType<
    { req: Request; children: ComponentChildren; revision: string }
  >;
  renderFn?: <T extends PageData = PageData>(
    data: T,
  ) => Promise<Response> | Response;
}

export interface Bindings<TAppManifest extends AppManifest = AppManifest> {
  renderer?: RendererOpts;
  framework: Framework;
  server?: Hono<DecoRouteState<TAppManifest>>;
}

const routes: Array<
  {
    paths: string[];
    // deno-lint-ignore no-explicit-any
    handler: DecoHandler<any>;
  }
> = [
  {
    paths: ["/styles.css"],
    handler: styles,
  },
  {
    paths: ["/live/_meta", "/deco/meta"],
    handler: metaHandler,
  },
  {
    paths: ["/live/release", "/.decofile"],
    handler: releaseHandler,
  },
  {
    paths: ["/live/inspect/:block", "/deco/inspect/:block"],
    handler: inspectHandler,
  },
  {
    paths: ["/live/invoke", "/deco/invoke"],
    handler: invokeHandler,
  },
  {
    paths: ["/live/invoke/*", "/deco/invoke/*"],
    handler: invokeKeyHandler,
  },
  {
    paths: ["/live/previews", "/deco/previews"],
    handler: previewsHandler,
  },
  {
    paths: ["/live/previews/*", "/deco/previews/*"],
    handler: previewHandler,
  },
  {
    paths: ["/live/workflows/run", "/deco/workflows/run"],
    handler: workflowHandler,
  },
  {
    paths: ["/deco/render"],
    handler: renderHandler,
  },
  {
    paths: ["/", "*"],
    handler: entrypoint,
  },
];

export const FrameworkContext = createContext<Framework | undefined>(
  undefined,
);

export const useFramework = () => {
  return useContext(FrameworkContext)!;
};

export const handlerFor = <TAppManifest extends AppManifest = AppManifest>(
  deco: Deco<TAppManifest>,
): (
  req: Request,
  bindings?: DecoRouteState<TAppManifest>["Bindings"],
) => Promise<Response> | Response => {
  const bindings = deco.bindings;
  const hono = bindings?.server ?? new Hono<DecoRouteState<TAppManifest>>();
  hono.use(async (ctx, next) => {
    const renderFn = ctx.env?.RENDER_FN ?? bindings?.renderer?.renderFn;
    const framework = bindings?.framework;
    const frameworkRenderFn = renderFn && framework
      ? (<T extends PageData = PageData>(
        data: T,
      ) =>
        renderFn({
          ...data,
          page: {
            Component: (props) => {
              return (
                <FrameworkContext.Provider value={framework ?? HTMX}>
                  <data.page.Component {...props} />
                </FrameworkContext.Provider>
              );
            },
            props: data.page.props,
            metadata: data.page.metadata,
          },
        }))
      : renderFn;
    frameworkRenderFn && ctx.setRenderer(
      // @ts-ignore: context render is not being used since JSR does not support global namespaces
      frameworkRenderFn,
    );

    const globals = ctx.env?.GLOBALS;
    globals && ctx.set("global", globals);

    await next();
  });
  hono.use(...middlewareFor(deco));
  for (const { paths, handler } of routes) {
    for (const path of paths) {
      hono.all(path, handler as HonoHandler);
    }
  }
  return hono.fetch.bind(hono);
};
