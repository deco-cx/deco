import { HandlerContext, Handlers, PageProps } from "$fresh/server.ts";
import {
  DecoManifest,
  Flag,
  LiveOptions,
  Mode,
  PageComponentData,
  PageDataData,
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
import {
  getFlagFromId,
  getPageFromId,
  getProdPage,
  getSiteIdFromName,
} from "./utils/supabase.ts";
import type { ComponentChildren, ComponentType } from "preact";
import type { Props as EditorProps } from "./src/Editor.tsx";
import LiveContext from "./context.ts";
import { deleteCookie } from "std/http/mod.ts";
import { isLoaderProp, propToLoaderInstance } from "./utils/loaders.ts";

const path = (obj: Record<string, any>, path: string) => {
  const pathList = path.split(".").filter(Boolean);
  let result = obj;

  pathList.forEach((key) => {
    if (!result[key]) {
      return result[key];
    }

    result = result[key];
  });

  return result;
};

let flags: Flag[];
export const flag = (id: string) => flags.find((flag) => flag.id === id);

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

export interface LivePageData extends PageDataData {
  editorComponents?: PageComponentData[];
  mode: Mode;
  template: string;
  siteId: number;
  flag: Flag | null;
}

export interface LoadLiveComponentsOptions {
  template?: string;
}

const getComponentsFromFlags = (
  path: string,
  prodComponents: PageDataData,
): PageDataData => {
  const activePages: PageDataData[] = [
    prodComponents,
  ];

  flags
    .filter(({ pages }) => pages[0].path === path)
    .forEach((flag) => {
      if (flag.traffic > 0) {
        activePages.push(flag.components!);
      }
    });

  // Randomly choose any active experiment
  const randomIdx = Math.floor(Math.random() * activePages.length);
  return activePages[randomIdx];
};

export async function loadLiveComponents(
  req: Request,
  _: HandlerContext<LivePageData>,
  options?: LoadLiveComponentsOptions,
): Promise<LivePageData> {
  const liveOptions = LiveContext.getLiveOptions();
  const site = liveOptions.site;
  const url = new URL(req.url);
  const { template } = options ?? {};

  const variantId = url.searchParams.get("variantId");

  if (!liveOptions.siteId) {
    liveOptions.siteId = await getSiteIdFromName(site);
  }

  let flag = null;
  let pages = [];
  const siteId = liveOptions.siteId!.toString();
  let components: PageDataData = { components: [], loaders: [] };

  try {
    pages = variantId
      ? await getPageFromId(variantId, siteId)
      : await getProdPage(
        siteId,
        url.pathname,
        template,
      );

    const prodComponents: PageDataData = pages![0]!.components;
    const flagId = pages![0]!.flag;
    flag = flagId ? await getFlagFromId(flagId, siteId) : null;

    components = variantId
      ? prodComponents
      : getComponentsFromFlags(pages![0]!.path, prodComponents);

    console.log("Found page:", pages, flag);
  } catch (error) {
    console.log("Error fetching page:", error.message);
  }

  const isEditor = url.searchParams.has("editor");

  return {
    components: components.components ?? [],
    loaders: components.loaders ?? [],
    mode: isEditor ? "edit" : "none",
    template: options?.template || url.pathname,
    siteId: liveOptions.siteId!,
    flag: flag,
  };
}

export function createLiveHandler(
  options?: LoadLiveComponentsOptions,
) {
  const handler: Handlers<LivePageData> = {
    async GET(req, ctx) {
      const url = new URL(req.url);
      // TODO: Find a better way to embedded this route on project routes.
      // Follow up here: https://github.com/denoland/fresh/issues/516
      if (url.pathname === "/live/api/components") {
        return componentsPreview(req);
      }

      if (url.pathname.startsWith("/live/api/components/")) {
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

      start("fetch-flags");
      const site = liveOptions.site;

      // TODO: Change change inner site.name to page.site (this site is id)
      const { data: Flags, error } = await getSupabaseClient()
        .from("flags")
        .select(
          `id, name, audience, traffic, site!inner(name, id), pages!inner(components, path, id)`,
        )
        .eq("site.name", site);

      if (error) {
        console.log("Error fetching flags:", error);
      }
      end("fetch-flags");

      start("calc-flags");
      // TODO: Cookie answer
      Flags?.map((flag) => {
        flag.active = Math.random() < flag.traffic;

        // TODO: Query from supabase return pages: [{components:[{}]}]. Transform to components:[{}]
        flag.components = flag.pages[0].components;
      });
      end("calc-flags");
      flags = Flags ?? [];

      let pageData: LivePageData;

      try {
        start("fetch-page-data");
        pageData = await loadLiveComponents(
          req,
          ctx,
          options as LoadLiveComponentsOptions,
        );
        end("fetch-page-data");

        // map back components from database to components for the editor, merging loader props into component props
        const editorComponents = pageData.components.map((componentData) => {
          const newComponentData = structuredClone(componentData);

          for (
            const [propName, value] of Object.entries(newComponentData.props)
          ) {
            if (isLoaderProp(value)) {
              const loaderName = propToLoaderInstance(value);
              newComponentData.props[propName] = structuredClone(
                pageData.loaders.find(({ name }) => name === loaderName) ?? {},
              ).props;
            }
          }

          return newComponentData;
        });

        pageData.editorComponents = editorComponents;

        start("fetch-loader-data");
        const loadersResponse = await Promise.all(
          pageData.loaders?.map(async ({ loader, props, name }) => {
            const loaderFn =
              LiveContext.getManifest().loaders[`./loaders/${loader}.ts`]
                .default.loader;
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
          {} as Record<string, unknown>,
        );

        pageData.components = pageData.components.map((componentData) => {
          /*
         * if any shallow prop that contains a mustache like `{loaderName.*}`,
         * then get the loaderData using path(loadersResponseMap, value.substring(1, value.length - 1))
         */

          Object.values(componentData.props ?? {}).forEach(
            (value) => {
              if (!isLoaderProp(value)) {
                return;
              }

              const loaderForwardedProps = path(
                loadersResponseMap,
                propToLoaderInstance(value),
              );

              componentData.props = {
                ...componentData.props,
                ...loaderForwardedProps,
              };
            },
          );

          return componentData;
        });
        end("map-loader-data");
      } catch (error) {
        // TODO: Do a better error handler. Maybe redirect to 500 page.
        console.log("Error running loader. \n", error);
        const headers = new Headers();
        headers.append("location", "/live/login");
        deleteCookie(headers, "live-access-token");
        deleteCookie(headers, "live-refresh-token");
        return new Response("Redirect", {
          status: 302,
          headers,
        });
      }

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

export function LiveComponents({ components }: LivePageData) {
  const manifest = LiveContext.getManifest();
  return (
    <>
      {components?.map(({ component, props }: PageComponentData) => {
        const Comp = getComponentModule(manifest, component)?.default;

        return <Comp {...props} />;
      })}
    </>
  );
}

export function LivePage({
  data,
  children,
  ...otherProps
}: PageProps<LivePageData> & {
  children: ComponentChildren;
}) {
  const manifest = LiveContext.getManifest();
  const InspectVSCode = !LiveContext.isDenoDeploy() &&
    manifest.islands[`./islands/InspectVSCode.tsx`]?.default;
  const Editor: ComponentType<EditorProps> = manifest
    .islands[`./islands/Editor.tsx`]?.default;

  if (!Editor) {
    console.log("Missing Island: ./island/Editor.tsx");
  }

  const renderEditor = Boolean(Editor) && data.mode === "edit";
  const privateDomain = LiveContext.isPrivateDomain(otherProps.url.hostname);
  const componentSchemas = manifest.schemas;

  return (
    <div class="flex">
      <div
        class={`w-full relative ${
          renderEditor && privateDomain ? "pr-80" : ""
        }`}
      >
        {children ? children : <LiveComponents {...data} />}
      </div>
      {renderEditor && privateDomain
        ? (
          <Editor
            components={data.editorComponents!}
            template={data.template}
            componentSchemas={componentSchemas}
            siteId={data.siteId}
            flag={data.flag}
          />
        )
        : null}
      {privateDomain && <EditorListener />}
      {InspectVSCode ? <InspectVSCode /> : null}
    </div>
  );
}
