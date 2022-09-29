import { HandlerContext, Handlers, PageProps } from "$fresh/server.ts";
import {
  DecoManifest,
  LiveOptions,
  Mode,
  PageComponentData,
  PageLoaderData,
} from "$live/types.ts";
import InspectVSCodeHandler from "https://deno.land/x/inspect_vscode@0.0.5/handler.ts";
import getSupabaseClient from "$live/supabase.ts";
import { authHandler } from "$live/auth.tsx";
import { createServerTiming } from "$live/utils/serverTimings.ts";
import {
  componentsPreview,
  renderComponent,
  updateComponentProps,
} from "$live/editor.tsx";
import EditorListener from "./src/EditorListener.tsx";
import { getComponentModule } from "./utils/component.ts";
import type { ComponentChildren, ComponentType } from "preact";
import type { Props as EditorProps } from "./src/Editor.tsx";
import LiveContext from "./context.ts";

function path(obj: Record<string, any>, path: string) {
  const pathList = path.split(".").filter(Boolean);
  let result = obj;

  pathList.forEach((key) => {
    if (!result[key]) {
      return result[key];
    }

    result = result[key];
  });

  return result;
}

export const setupLive = (manifest: DecoManifest, liveOptions: LiveOptions) => {
  LiveContext.setupManifestAndOptions({ manifest, liveOptions });

  LiveContext.pushDefaultDomains(
    `${liveOptions.site}.deco.page`,
    `deco-pages-${liveOptions.site}.deno.dev`,
  );

  // Support deploy preview domains
  if (LiveContext.isDenoDeploy()) {
    LiveContext.pushDefaultDomains(
      `deco-pages-${liveOptions.site}-${LiveContext.getDeploymentId()}.deno.dev`,
    );
  }

  const userDomains = liveOptions.domains || [];
  LiveContext.setLiveOptions({
    ...liveOptions,
    domains: [...LiveContext.getDefaultDomains(), ...userDomains],
  });
};

export interface LivePageData {
  editorComponents?: PageComponentData[];
  components: PageComponentData[];
  loaders: PageLoaderData[];
  mode: Mode;
  template: string;
}

export interface LoadLiveComponentsOptions {
  template?: string;
}

export async function loadLiveComponents(
  req: Request,
  _: HandlerContext<any>,
  options?: LoadLiveComponentsOptions,
): Promise<LivePageData> {
  const liveOptions = LiveContext.getLiveOptions();
  const site = liveOptions.site;
  const url = new URL(req.url);
  const { template } = options ?? {};

  /**
   * Queries follow PostgREST syntax
   * https://postgrest.org/en/stable/api.html#horizontal-filtering-rows
   */
  const queries = [url.pathname, template]
    .filter((query) => Boolean(query))
    .map((query) => `path.eq.${query}`)
    .join(",");

  const { data: pagesData, error } = await getSupabaseClient()
    .from("pages")
    .select(`components, path, site!inner(name, id)`)
    .eq("site.name", site)
    .or(queries);

  if (error) {
    console.log("Error fetching page:", error);
  } else {
    console.log("Found page:", pagesData);
  }

  const [firstPage] = pagesData ?? [];

  if (!liveOptions.siteId && firstPage?.site) {
    liveOptions.siteId = firstPage?.site.id;
  }

  const isEditor = url.searchParams.has("editor");

  return {
    components: firstPage?.components?.components ?? [],
    loaders: firstPage?.components?.loaders ?? [],
    mode: isEditor ? "edit" : "none",
    template: options?.template || url.pathname,
  };
}

export function createLiveHandler<LoaderData = LivePageData>(
  options?: LoadLiveComponentsOptions,
) {
  const handler: Handlers<LoaderData | LivePageData> = {
    async GET(req, ctx) {
      const url = new URL(req.url);
      // TODO: Find a better way to embedded this route on project routes.
      // Follow up here: https://github.com/denoland/fresh/issues/516
      if (url.pathname === "/live/api/components") {
        return componentsPreview(req);
      }

      if (
        url.pathname.startsWith("/live/api/components/")
      ) {
        return renderComponent(req);
      }

      const { start, end, printTimings } = createServerTiming();
      const liveOptions = LiveContext.getLiveOptions();
      const domains: string[] = liveOptions.domains || [];

      if (!domains.includes(url.hostname)) {
        console.log("Domain not found:", url.hostname);
        console.log("Configured domains:", domains);

        // TODO: render custom 404 page
        return new Response("Site not found", { status: 404 });
      }

      if (url.pathname === "/live/proxy/gtag/js") {
        const trackingId = url.searchParams.get("id");
        console.log("Proxying gtag", trackingId);
        return fetch(
          `https://www.googletagmanager.com/gtag/js?id=${trackingId}`,
        );
      }

      start("fetch-page-data");
      const pageData = await loadLiveComponents(
        req,
        ctx,
        options as LoadLiveComponentsOptions,
      );
      end("fetch-page-data");

      const isLoaderProp = (value: any): value is string =>
        typeof value === "string" && value.charAt(0) === "{" &&
        value.charAt(value.length - 1) === "}";

      // map back components from database to components for the editor, merging loader props into component props
      const editorComponents = pageData.components.map((componentData) => {
        if (
          Object.values(componentData.props ?? {}).some(isLoaderProp)
        ) {
          const newComponentData = structuredClone(componentData);

          for (
            const [propName, value] of Object.entries(newComponentData.props)
          ) {
            if (isLoaderProp(value)) {
              const loaderName = value.substring(1, value.length - 1);
              newComponentData.props[propName] = structuredClone(
                pageData.loaders.find(({ name }) => name === loaderName) ?? {},
              ).props;
            }
          }

          return newComponentData;
        }

        return componentData;
      });

      pageData.editorComponents = editorComponents;

      start("fetch-loader-data");
      const loadersResponse = await Promise.all(
        pageData.loaders?.map(async ({ loader, props, name }) => {
          const loaderFn =
            LiveContext.getManifest().loaders[`./loaders/${loader}.ts`]
              .default;
          start(`loader#${name}`);
          const loaderData = await loaderFn(req, ctx, props);
          end(`loader#${name}`);
          return {
            name,
            data: loaderData,
          };
        }) ?? [],
      );
      end("fetch-loader-data");

      start("map-loader-data");
      const loadersResponseMap = loadersResponse.reduce(
        (result, currentResponse) => {
          result[currentResponse.name] = currentResponse.data;
          return result;
        },
        {} as Record<string, any>,
      );

      pageData.components = pageData.components.map((componentData) => {
        /*
         * if any shallow prop that contains a mustache like `{loaderName.*}`,
         * then get the loaderData using path(loadersResponseMap, value.substring(1, value.length - 1))
         */

        Object.values(componentData.props ?? {}).forEach(
          (value) => {
            if (isLoaderProp(value)) {
              componentData.props = {
                ...componentData.props,
                ...path(
                  loadersResponseMap,
                  value.substring(1, value.length - 1),
                ),
              };
            }
          },
        );

        return componentData;
      });
      end("map-loader-data");

      start("render");
      const res = await ctx.render(pageData);
      end("render");

      res.headers.set("Server-Timing", printTimings());

      return res;
    },
    async POST(req, ctx) {
      const url = new URL(req.url);
      if (url.pathname === "/inspect-vscode" && !LiveContext.isDenoDeploy()) {
        return await InspectVSCodeHandler.POST!(req, ctx);
      }
      if (url.pathname === "/live/api/credentials") {
        return await authHandler.POST!(req, ctx);
      }
      if (url.pathname === "/live/api/editor") {
        return await updateComponentProps(req, ctx);
      }

      return new Response("Not found", { status: 404 });
    },
  };

  return handler;
}

export function LiveComponents(
  { components }: LivePageData,
) {
  const manifest = LiveContext.getManifest();
  return (
    <div class="relative w-full">
      {components?.map(({ component, props }: PageComponentData) => {
        const Comp = getComponentModule(manifest, component)?.default;

        return <Comp {...props} />;
      })}
    </div>
  );
}

export function LivePage(
  { data, children, ...otherProps }: PageProps<LivePageData> & {
    children: ComponentChildren;
  },
) {
  const manifest = LiveContext.getManifest();
  const InspectVSCode = !LiveContext.isDenoDeploy() &&
    manifest.islands[`./islands/InspectVSCode.tsx`]?.default;
  const Editor: ComponentType<EditorProps> = manifest
    .islands[`./islands/Editor.tsx`]
    ?.default;

  if (!Editor) {
    console.log("Missing Island: ./island/Editor.tsx");
  }

  const renderEditor = Boolean(Editor) && data.mode === "edit";
  const privateDomain = LiveContext.isPrivateDomain(otherProps.url.hostname);
  const componentSchemas = manifest.schemas;

  return (
    <div class="flex">
      {children ? children : <LiveComponents {...data} />}
      {renderEditor && privateDomain
        ? (
          <Editor
            components={data.editorComponents!}
            template={data.template}
            componentSchemas={componentSchemas}
          />
        )
        : null}
      {privateDomain && <EditorListener />}
      {InspectVSCode ? <InspectVSCode /> : null}
    </div>
  );
}
