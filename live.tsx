/** @jsx h */
/** @jsxFrag Fragment */
import { Fragment, h } from "preact";
import { Handlers, PageProps } from "$fresh/server.ts";
import { DecoManifest, DecoState } from "$live/types.ts";
import getSupabaseClient from "./supabase.ts";

// While Fresh doesn't allow for injecting routes and middlewares,
// we have to deliberately store the manifest in this scope.
let userManifest: DecoManifest;
export const setManifest = (manifest: DecoManifest) => {
  userManifest = manifest;
};

// TODO: enable inspect vs code automatically if localhost
// const isDenoDeploy = Deno.env.get("DENO_DEPLOYMENT_ID") !== undefined;
const site = Deno.env.get("DECO_SITE") as string;
const domainsEnv = Deno.env.get("DECO_DOMAINS");
const domains: string[] = domainsEnv ? JSON.parse(domainsEnv) : [];
domains.push(
  `${site}.deco.page`,
  `deco-pages-${site}.deno.dev`,
  `localhost`,
);

interface LiveRouteData {
  manifest?: any;
  components?: any;
  defaultRender?: any;
}

export function createLiveRoute(defaultRender?: (props: PageProps) => any) {
  const handler: Handlers<LiveRouteData, DecoState> = {
    async GET(req, ctx) {
      const url = new URL(req.url);

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

      if (error || !Pages || Pages.length === 0) {
        if (error) {
          console.log("Error fetching page:", error);
        }
        if (defaultRender) {
          console.log("Using default render");
        } else {
          console.log("No default render");
        }
        return ctx.render();
      }

      console.log("Found page:", Pages);

      const components = Pages![0]?.components;
      const data = {
        components,
      };
      return ctx.render(data);
    },
  };

  function LiveRoute(
    props: PageProps<LiveRouteData>,
  ) {
    const { data } = props;
    if (!data || !data.components || data.components.length === 0) {
      if (defaultRender) {
        return defaultRender(props);
      } else {
        return <div>Page not found</div>;
      }
    }
    const { components } = data;
    const manifest = userManifest;
    return (
      <>
        {components.map(({ component, props }: any) => {
          const Comp =
            manifest.islands[`./islands/${component}.tsx`]?.default ||
            manifest.components![`./components/${component}.tsx`]?.default;
          return <Comp {...props} />;
        })}
      </>
    );
  }

  return {
    handler,
    LiveRoute,
  };
}
