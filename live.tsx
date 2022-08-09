/** @jsx h */
/** @jsxFrag Fragment */
import { Fragment, h } from "preact";
import { HandlerContext, Handlers, PageProps } from "$fresh/server.ts";
import { DecoManifest, LiveOptions } from "$live/types.ts";
import InspectVSCodeHandler from "https://deno.land/x/inspect_vscode@0.0.5/handler.ts";
import getSupabaseClient from "./supabase.ts";
import { authHandler } from "./auth.tsx";
import { createServerTiming } from "./utils/serverTimings.ts";

// While Fresh doesn't allow for injecting routes and middlewares,
// we have to deliberately store the manifest in this scope.
let userManifest: DecoManifest;
let userOptions: LiveOptions;

export const setupLive = (manifest: DecoManifest, liveOptions: LiveOptions) => {
  userManifest = manifest;
  userOptions = liveOptions;
};

const isDenoDeploy = Deno.env.get("DENO_DEPLOYMENT_ID") !== undefined;

interface LivePageData<Data> {
  components?: any;
  loaderData?: Data;
}

export interface LivePageOptions<Data> {
  template?: string;
  render?: (props: PageProps<LivePageData<Data>>) => any;
  loader?: (
    req: Request,
    ctx: HandlerContext<LivePageData<Data>>
  ) => Promise<Data>;
}

export function createLivePage<Data>(options?: LivePageOptions<Data>) {
  const { render: defaultRender, loader, template } = options ?? {};

  const handler: Handlers<LivePageData<Data>> = {
    async GET(req, ctx) {
      const { start, end, printTimings } = createServerTiming();
      const url = new URL(req.url);
      const site = userOptions.site;
      const domains: string[] = userOptions.domains || [];
      domains.push(
        `${site}.deco.page`,
        `deco-pages-${site}.deno.dev`,
        `localhost`
      );

      if (!domains.includes(url.hostname)) {
        console.log("Domain not found:", url.hostname);
        console.log("Configured domains:", domains);

        // TODO: render custom 404 page
        return new Response("Site not found", { status: 404 });
      }

      /**
       * Queries follow PostgREST syntax
       * https://postgrest.org/en/stable/api.html#horizontal-filtering-rows
       */
      const queries = [url.pathname, template]
        .filter((query) => Boolean(query))
        .map((query) => `path.eq.${query}`)
        .join(",");

      start("fetch-page-data");
      const pagePromise = getSupabaseClient()
        .from("Pages")
        .select(`components, path, site!inner(name, id)`)
        .eq("site.name", site)
        .or(queries);
      const loaderPromise = loader?.(req, ctx);

      const [pageData, loaderData] = await Promise.all([
        pagePromise,
        loaderPromise,
      ]);
      end("fetch-page-data");

      const { data: Pages, error } = pageData;

      if (error) {
        console.log("Error fetching page:", error);
      } else {
        console.log("Found page:", Pages);
      }

      const components = (Pages && Pages[0]?.components) || null;
      const data = {
        components,
        loaderData,
      };

      start("render");
      const res = await ctx.render(data);
      end("render");

      res.headers.set("Server-Timing", printTimings());

      return res;
    },
    async POST(req, ctx) {
      const url = new URL(req.url);
      if (url.pathname === "/inspect-vscode" && !isDenoDeploy) {
        return await InspectVSCodeHandler.POST!(req, ctx as any);
      }
      if (url.pathname === "/api/credentials") {
        return await authHandler.POST!(req, ctx as any);
      }
      return new Response("Not found", { status: 404 });
    },
  };

  function LivePage(props: PageProps<LivePageData<Data>>) {
    const manifest = userManifest;
    const { data } = props;
    const { components, loaderData } = data;
    const renderComponents =
      components && components.length > 0 ? (
        components.map(({ component, props }: any) => {
          const Comp =
            manifest.islands[`./islands/${component}.tsx`]?.default ||
            manifest.components![`./components/${component}.tsx`]?.default;
          return <Comp {...props} loaderData={loaderData} />;
        })
      ) : defaultRender ? (
        defaultRender(props)
      ) : (
        <div>Page not found</div>
      );
    const InspectVSCode =
      !isDenoDeploy &&
      userManifest.islands[`./islands/InspectVSCode.tsx`]?.default;
    return (
      <>
        {renderComponents}
        {InspectVSCode ? <InspectVSCode /> : null}
      </>
    );
  }

  return {
    handler,
    LivePage,
  };
}
