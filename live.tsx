/** @jsx h */
/** @jsxFrag Fragment */
import { Fragment, h } from "preact";
import { HandlerContext, Handlers, PageProps } from "$fresh/server.ts";
import { DecoManifest, DecoState, LiveOptions } from "$live/types.ts";
import InspectVSCodeHandler from "https://deno.land/x/inspect_vscode@0.0.5/handler.ts";
import getSupabaseClient from "./supabase.ts";
import { authHandler } from "./auth.tsx";

// While Fresh doesn't allow for injecting routes and middlewares,
// we have to deliberately store the manifest in this scope.
let userManifest: DecoManifest;
let userOptions: LiveOptions;

export const setupLive = (
  manifest: DecoManifest,
  liveOptions: LiveOptions,
) => {
  userManifest = manifest;
  userOptions = liveOptions;
};

const isDenoDeploy = Deno.env.get("DENO_DEPLOYMENT_ID") !== undefined;
interface LiveRouteData {
  manifest?: any;
  components?: any;
  defaultRender?: any;
}

export interface LiveRouteOptions<Data = unknown> {
  render?: (props: PageProps) => any;
  loader?: (
    req: Request,
    ctx: HandlerContext<Data>,
    props: PageProps,
  ) => Promise<Data>;
}

export function createLiveRoute<Data>(options: LiveRouteOptions<Data>) {
  const defaultRender = options.render;

  const handler: Handlers<LiveRouteData, DecoState> = {
    async GET(req, ctx) {
      const url = new URL(req.url);
      const site = userOptions.site;
      const domains: string[] = userOptions.domains || [];
      domains.push(
        `${site}.deco.page`,
        `deco-pages-${site}.deno.dev`,
        `localhost`,
      );

      if (!domains.includes(url.hostname)) {
        console.log("Domain not found:", url.hostname);
        console.log("Configured domains:", domains);

        // TODO: render custom 404 page
        return new Response("Site not found", { status: 404 });
      }

      let { data: Pages, error } = await getSupabaseClient()
        .from("Pages")
        .select(`components, path, site!inner(name, id)`)
        .eq("site.name", site)
        .eq("path", url.pathname);

      if (error) {
        console.log("Error fetching page:", error);
      } else {
        console.log("Found page:", Pages);
      }

      const components = Pages && Pages[0]?.components || null;
      const data = {
        components,
      };
      return ctx.render(data);
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

  function LiveRoute(
    props: PageProps<LiveRouteData>,
  ) {
    const manifest = userManifest;
    const { data } = props;
    const { components } = data;
    const renderComponents = components && components.length > 0
      ? components.map(({ component, props }: any) => {
        const Comp = manifest.islands[`./islands/${component}.tsx`]?.default ||
          manifest.components![`./components/${component}.tsx`]?.default;
        return <Comp {...props} />;
      })
      : defaultRender
      ? defaultRender(props)
      : <div>Page not found</div>;
    const InspectVSCode = !isDenoDeploy &&
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
    LiveRoute,
  };
}
