import { HandlerContext, Handlers, PageProps } from "$fresh/server.ts";
import {
  DecoManifest,
  LiveOptions,
  Mode,
  PageComponentData,
} from "$live/types.ts";
import InspectVSCodeHandler from "https://deno.land/x/inspect_vscode@0.0.5/handler.ts";
import getSupabaseClient from "$live/supabase.ts";
import { authHandler } from "$live/auth.tsx";
import { createServerTiming } from "$live/utils/serverTimings.ts";
import { IslandModule } from "$fresh/src/server/types.ts";
import { updateComponentProps } from "$live/editor.tsx";
import EditorListener from "./src/EditorListener.tsx";
import { JSONSchema7 } from "https://esm.sh/v92/@types/json-schema@7.0.11/X-YS9yZWFjdDpwcmVhY3QvY29tcGF0CmQvcHJlYWN0QDEwLjEwLjY/index.d.ts";

// While Fresh doesn't allow for injecting routes and middlewares,
// we have to deliberately store the manifest in this scope.
let userManifest: DecoManifest;
let userOptions: LiveOptions & { siteId?: number };
const deploymentId = Deno.env.get("DENO_DEPLOYMENT_ID");
const isDenoDeploy = deploymentId !== undefined;
const defaultDomains = [
  `localhost`,
];

export const setupLive = (manifest: DecoManifest, liveOptions: LiveOptions) => {
  userManifest = manifest;
  userOptions = liveOptions;
  defaultDomains.push(
    `${userOptions.site}.deco.page`,
    `deco-pages-${userOptions.site}.deno.dev`,
  );

  // Support deploy preview domains
  if (deploymentId) {
    defaultDomains.push(
      `deco-pages-${userOptions.site}-${deploymentId}.deno.dev`,
    );
  }
  const userDomains = liveOptions.domains || [];
  userOptions.domains = [...defaultDomains, ...userDomains];
};

function isPrivateDomain(domain: string) {
  return defaultDomains.includes(domain);
}

export interface LivePageData {
  components?: PageComponentData[];
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
  const site = userOptions.site;
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

  const { data: Pages, error } = await getSupabaseClient()
    .from("pages")
    .select(`components, path, site!inner(name, id)`)
    .eq("site.name", site)
    .or(queries);

  if (error) {
    console.log("Error fetching page:", error);
  } else {
    console.log("Found page:", Pages);
  }

  if (!userOptions.siteId && Pages?.[0]?.site) {
    userOptions.siteId = Pages?.[0]?.site.id;
  }

  const isEditor = url.searchParams.has("editor");

  return {
    components: Pages?.[0]?.components ?? null,
    mode: isEditor ? "edit" : "none",
    template: options?.template || url.pathname,
  };
}

interface CreateLivePageOptions<LoaderData> {
  loader?: (
    req: Request,
    ctx: HandlerContext<LoaderData>,
  ) => Promise<LoaderData>;
}

export function createLiveHandler<LoaderData = LivePageData>(
  options?: CreateLivePageOptions<LoaderData> | LoadLiveComponentsOptions,
) {
  const { loader } = (options ?? {}) as CreateLivePageOptions<LoaderData>;
  const handler: Handlers<LoaderData | LivePageData> = {
    async GET(req, ctx) {
      const { start, end, printTimings } = createServerTiming();
      const domains: string[] = userOptions.domains || [];
      const url = new URL(req.url);

      if (!domains.includes(url.hostname)) {
        console.log("Domain not found:", url.hostname);
        console.log("Configured domains:", domains);

        // TODO: render custom 404 page
        return new Response("Site not found", { status: 404 });
      }

      start("fetch-page-data");
      let loaderData = undefined;

      try {
        if (typeof loader === "function") {
          loaderData = await loader(req, ctx);
        } else {
          loaderData = await loadLiveComponents(
            req,
            ctx,
            options as LoadLiveComponentsOptions,
          );
        }
      } catch (error) {
        console.log("Error running loader. \n", error);
        // TODO: Do a better error handler. Maybe redirect to 500 page.
      }

      end("fetch-page-data");

      start("render");
      const res = await ctx.render(loaderData);
      end("render");

      res.headers.set("Server-Timing", printTimings());

      return res;
    },
    async POST(req, ctx) {
      const url = new URL(req.url);
      if (url.pathname === "/inspect-vscode" && !isDenoDeploy) {
        return await InspectVSCodeHandler.POST!(req, ctx);
      }
      if (url.pathname === "/live/api/credentials") {
        return await authHandler.POST!(req, ctx);
      }
      if (url.pathname === "/live/api/editor") {
        const options = { userOptions };
        return await updateComponentProps(req, ctx, options);
      }
      return new Response("Not found", { status: 404 });
    },
  };

  return handler;
}

interface Module extends IslandModule {
  schema?: JSONSchema7;
}

function getComponentModule(filename: string): Module | undefined {
  return userManifest.islands?.[`./islands/${filename}.tsx`] ??
    userManifest.components?.[`./components/${filename}.tsx`];
}

export function LiveComponents(
  { components }: LivePageData,
) {
  return (
    <div class="relative w-full">
      {components?.map(({ component, props }: PageComponentData) => {
        const Comp = getComponentModule(component)?.default;

        return <Comp {...props} />;
      })}
    </div>
  );
}

export function LivePage({ data, ...otherProps }: PageProps<LivePageData>) {
  const InspectVSCode = !isDenoDeploy &&
    userManifest.islands[`./islands/InspectVSCode.tsx`]?.default;
  const Editor = userManifest.islands[`./islands/Editor.tsx`]?.default;

  if (!Editor) {
    console.log("Missing Island: ./island/Editor.tsx");
  }

  const renderEditor = Boolean(Editor) && data.mode === "edit";
  const privateDomain = isPrivateDomain(otherProps.url.hostname);
  const componentSchemas = userManifest.schemas;

  return (
    <div class="flex">
      <LiveComponents {...data} />
      {renderEditor && privateDomain
        ? (
          <Editor
            components={data.components}
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
