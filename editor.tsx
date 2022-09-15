import { HandlerContext } from "$fresh/server.ts";
import { ASSET_CACHE_BUST_KEY } from "$fresh/runtime.ts";
import { renderToString } from "preact-render-to-string";
import LiveContext from "./context.ts";
import { getSupabaseClientForUser } from "./supabase.ts";
import { Module } from "./types.ts";
import {
  componentNameFromPath,
  getComponentModule,
} from "./utils/component.ts";
import { createServerTiming } from "./utils/serverTimings.ts";

const ONE_YEAR_CACHE = "public, max-age=31536000, immutable";

export async function updateComponentProps(
  req: Request,
  _: HandlerContext,
) {
  const url = new URL(req.url);
  if (!LiveContext.isPrivateDomain(url.hostname)) {
    return new Response("Not found", { status: 404 });
  }

  let status;
  const liveOptions = LiveContext.getLiveOptions();

  try {
    const { components, template } = await req.json();

    if (!liveOptions.siteId) {
      // TODO: fetch site id from supabase
    }

    // TODO: Validate components props on schema

    const res = await getSupabaseClientForUser(req).from("pages").update({
      components: components,
    }).match({ site: liveOptions.siteId, path: template });

    status = res.status;
  } catch (e) {
    console.error(e);
    status = 400;
  }

  return new Response(null, { status });
}

export interface ComponentPreview {
  componentLabel: string;
  component: string;
  link: string;
}

function mapComponentsToPreview(
  [componentPath, componentModule]: [string, Module],
) {
  const { schema } = componentModule;

  if (!schema) {
    return;
  }

  const componentName = componentNameFromPath(componentPath);

  return {
    link: `/live/api/components/${componentName}`,
    component: componentName,
    componentLabel: schema.title ?? componentName,
  };
}

export function componentsPreview(
  req: Request,
) {
  const url = new URL(req.url);

  if (!LiveContext.isPrivateDomain(url.hostname)) {
    return new Response("Not found", { status: 404 });
  }

  const { start, end, printTimings } = createServerTiming();
  const manifest = LiveContext.getManifest();

  start("map-components");
  const components: ComponentPreview[] = Object.entries(manifest.components)
    .map(
      mapComponentsToPreview,
    ).filter(
      (componentPreviewData): componentPreviewData is ComponentPreview =>
        Boolean(componentPreviewData),
    );

  const islands: ComponentPreview[] = Object.entries(manifest.islands).map(
    mapComponentsToPreview,
  ).filter((componentPreviewData): componentPreviewData is ComponentPreview =>
    Boolean(componentPreviewData)
  );
  end("map-components");

  const cache = LiveContext.isDenoDeploy() &&
    url.searchParams.has(ASSET_CACHE_BUST_KEY);

  return new Response(JSON.stringify({ components, islands }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "Server-Timing": printTimings(),
      ...(cache
        ? {
          "Cache-Control": ONE_YEAR_CACHE,
        }
        : {}),
    },
  });
}

export function renderComponent(
  req: Request,
) {
  const url = new URL(req.url);

  if (!LiveContext.isPrivateDomain(url.hostname)) {
    return new Response("Not found", { status: 404 });
  }

  const { start, end, printTimings } = createServerTiming();

  const componentName = url.pathname.replace("/live/api/components/", "") ?? "";
  const manifest = LiveContext.getManifest();
  const Component = getComponentModule(manifest, componentName)?.default;

  if (!Component) {
    return new Response(JSON.stringify({ error: "Component Not Found" }), {
      status: 404,
    });
  }

  let html: string;
  start("render-component");
  try {
    html = renderToString(<Component />);
  } catch (e) {
    if (url.hostname === "localhost") {
      throw e;
    }

    html = renderToString(<div>Failed to load component</div>);
  }
  end("render-component");

  const cache = LiveContext.isDenoDeploy() &&
    url.searchParams.has(ASSET_CACHE_BUST_KEY);

  return new Response(
    html,
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "Server-Timing": printTimings(),
        ...(cache
          ? {
            "Cache-Control": ONE_YEAR_CACHE,
          }
          : {}),
      },
    },
  );
}
