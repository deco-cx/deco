/** @jsx h */
/** @jsxFrag Fragment */
import { Fragment, h } from "preact";
import { Handlers, PageProps } from "$fresh/server.ts";
import { createClient } from "supabase";
import { DecoState } from "$live/types.ts";

const decoSite = Deno.env.get("DECO_SITE") || 4;

const supabase = createClient(
  `https://${Deno.env.get("SUPABASE_ACCOUNT") as string}.supabase.co`,
  Deno.env.get("SUPABASE_KEY") as string,
);

export const handler: Handlers<DynamicRouteData, DecoState> = {
  async GET(req, ctx) {
    const url = new URL(req.url);
    let { data: Pages, error } = await supabase
      .from("Pages")
      .select("components, site, path")
      .eq("site", decoSite)
      .eq("path", url.pathname);

    if (error) {
      console.log(error);
    }
    const components = Pages![0]?.components;
    const props = {
      components,
      url,
      manifest: ctx.state.manifest,
    };
    return ctx.render(props);
  },
};

interface DynamicRouteData {
  manifest: any;
  components: any;
}

export default function DynamicRoute(
  { data, url }: PageProps<DynamicRouteData>,
) {
  const { components, manifest } = data;
  return (
    <>
      {components.map(({ component, props }: any) => {
        const Comp = manifest.islands[`./islands/${component}.tsx`]?.default ||
          manifest.components[`./components/${component}.tsx`]?.default;
        return <Comp {...props} />;
      })}
    </>
  );
}
