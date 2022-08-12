/** @jsx h */
/** @jsxFrag Fragment */
import { Fragment, h } from "preact";
import { HandlerContext, Handlers, PageProps } from "$fresh/server.ts";
import { DecoManifest, LiveOptions } from "$live/types.ts";
import InspectVSCodeHandler from "https://deno.land/x/inspect_vscode@0.0.5/handler.ts";
import getSupabaseClient from "$live/supabase.ts";
import { authHandler } from "$live/auth.tsx";
import { createServerTiming } from "$live/utils/serverTimings.ts";

// While Fresh doesn't allow for injecting routes and middlewares,
// we have to deliberately store the manifest in this scope.
let userManifest: DecoManifest;
let userOptions: LiveOptions;
const deploymentId = Deno.env.get("DENO_DEPLOYMENT_ID");
const isDenoDeploy = deploymentId !== undefined;

export const setupLive = (manifest: DecoManifest, liveOptions: LiveOptions) => {
  userManifest = manifest;
  userOptions = liveOptions;
  const defaultDomains = [
    `${userOptions.site}.deco.page`,
    `deco-pages-${userOptions.site}.deno.dev`,
    `localhost`,
  ];
  // Support deploy preview domains
  if (deploymentId) {
    defaultDomains.push(
      `deco-pages-${userOptions.site}-${deploymentId}.deno.dev`,
    );
  }
  const userDomains = liveOptions.domains || [];
  userOptions.domains = [...defaultDomains, ...userDomains];
};

export interface PageComponentData {
  component: string;
  props?: Record<string, unknown>;
}

export interface LivePageData {
  components?: PageComponentData[];
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
    .from("Pages")
    .select(`components, path, site!inner(name, id)`)
    .eq("site.name", site)
    .or(queries);

  if (error) {
    console.log("Error fetching page:", error);
  } else {
    console.log("Found page:", Pages);
  }

  return { components: Pages?.[0]?.components ?? null };
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
      return new Response("Not found", { status: 404 });
    },
  };

  return handler;
}

interface LiveComponentsProps {
  components: PageComponentData[];
}

export function LiveComponents({ components }: LiveComponentsProps) {
  return (
    <>
      {components.map(({ component, props }: PageComponentData) => {
        const Comp =
          userManifest.islands[`./islands/${component}.tsx`]?.default ||
          userManifest.components?.[`./components/${component}.tsx`]?.default;
        return <Comp {...props} />;
      })}
    </>
  );
}

export function LivePage({ data }: PageProps<LivePageData>) {
  const { components = [] } = data;

  const InspectVSCode = !isDenoDeploy &&
    userManifest.islands[`./islands/InspectVSCode.tsx`]?.default;

  return (
    <>
      <LiveComponents components={components} />
      {InspectVSCode ? <InspectVSCode /> : null}
    </>
  );
}
