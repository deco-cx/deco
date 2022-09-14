import { HandlerContext } from "$fresh/server.ts";
import { renderToString } from "preact-render-to-string";
import {
  getLiveOptions,
  getManifest,
  isDenoDeploy,
  isPrivateDomain,
} from "./context.ts";
import { getSupabaseClientForUser } from "./supabase.ts";
import { Module } from "./types.ts";
import {
  COMPONENT_NAME_REGEX,
  componentNameFromPath,
  getComponentModule,
  isValidIsland,
} from "./utils/component.ts";
import { createServerTiming } from "./utils/serverTimings.ts";

const ONE_MINUTE = 60;
const ONE_HOUR = 60 * ONE_MINUTE;
const ONE_DAY = 24 * ONE_HOUR;

export async function updateComponentProps(
  req: Request,
  _: HandlerContext,
) {
  const url = new URL(req.url);
  if (!isPrivateDomain(url.hostname)) {
    return new Response("Not found", { status: 404 });
  }

  let status;
  const liveOptions = getLiveOptions();

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

  if (!isPrivateDomain(url.hostname)) {
    return new Response("Not found", { status: 404 });
  }

  const { start, end, printTimings } = createServerTiming();
  const manifest = getManifest();

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

  return new Response(JSON.stringify({ components, islands }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "Server-Timing": printTimings(),
      ...(isDenoDeploy()
        ? {
          "Cache-Control": `max-age=${
            15 * ONE_MINUTE
          }, stale-while-revalidate=${ONE_DAY}`,
        }
        : {}),
    },
  });
}

export function renderComponent(
  req: Request,
) {
  const url = new URL(req.url);

  if (!isPrivateDomain(url.hostname)) {
    return new Response("Not found", { status: 404 });
  }

  const { start, end, printTimings } = createServerTiming();

  const componentName = url.pathname.split("/").pop() ?? "";
  const manifest = getManifest();
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

  return new Response(
    html,
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "Server-Timing": printTimings(),
        ...(isDenoDeploy()
          ? {
            "Cache-Control": `max-age=${
              15 * ONE_MINUTE
            }, stale-while-revalidate=${ONE_DAY}`,
          }
          : {}),
      },
    },
  );
}
