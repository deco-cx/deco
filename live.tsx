import { HandlerContext, Handlers, PageProps } from "$fresh/server.ts";
import {
  DecoManifest,
  Flag,
  LiveOptions,
  Mode,
  PageComponentData,
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
  getPageFromId,
  getProdPage,
  getSiteIdFromName,
} from "./utils/supabase.ts";
import type { ComponentChildren, ComponentType } from "preact";
import type { Props as EditorProps } from "./src/Editor.tsx";
import LiveContext from "./context.ts";

let flags: Flag[];
export const flag = (name: string) =>
  flags.find((flag) => flag.name === name)?.active;

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
  components: PageComponentData[];
  mode: Mode;
  template: string;
  siteId: number;
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

  const draftId = url.searchParams.get("editor");

  if (!liveOptions.siteId) {
    liveOptions.siteId = await getSiteIdFromName(req, site);
  }

  let pages = [];

  try {
    pages = draftId ? await getPageFromId(req, draftId) : await getProdPage(
      req,
      liveOptions.siteId!.toString(),
      url.pathname,
      template,
    );
    console.log("Found page:", pages);
  } catch (error) {
    console.log("Error fetching page:", error.message);
  }

  const isEditor = url.searchParams.has("editor");

  return {
    components: pages?.[0]?.components ?? [],
    mode: isEditor ? "edit" : "none",
    template: options?.template || url.pathname,
    siteId: liveOptions.siteId!,
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

      start("fetch-flags");
      const site = liveOptions.site;
      const { data: Flags, error: error2 } = await getSupabaseClient()
        .from("flags")
        .select(`name, audience, traffic, site!inner(name, id)`)
        .eq("site.name", site);

      if (error2) {
        console.log("Error fetching flags:", error2);
      } else {
        console.log("Found flags:", Flags);
      }
      end("fetch-flags");

      start("calc-flags");
      // TODO: Cookie answer
      Flags?.map((flag: Flag) => {
        flag.active = Math.random() < flag.traffic;
      });
      end("calc-flags");
      flags = Flags ?? [];

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
            components={data.components}
            template={data.template}
            componentSchemas={componentSchemas}
            siteId={data.siteId}
          />
        )
        : null}
      {privateDomain && <EditorListener />}
      {InspectVSCode ? <InspectVSCode /> : null}
    </div>
  );
}
