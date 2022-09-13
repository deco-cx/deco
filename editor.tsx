import { HandlerContext } from "$fresh/server.ts";
import { renderToString } from "preact-render-to-string";
import {
  getDefaultDomains,
  getLiveOptions,
  getManifest,
  isPrivateDomain,
} from "./context.ts";
import { getSupabaseClientForUser } from "./supabase.ts";
import {
  COMPONENT_NAME_REGEX,
  componentNameFromPath,
  getComponentModule,
  isValidIsland,
} from "./utils/component.ts";
import { createServerTiming } from "./utils/serverTimings.ts";

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

export function componentsPreview(
  url: URL,
  componentType: "components" | "islands",
) {
  if (!isPrivateDomain(url.hostname)) {
    return new Response("Not found", { status: 404 });
  }

  const { start, end, printTimings } = createServerTiming();
  const manifest = getManifest();

  start("map-components");
  const components: ComponentPreview[] = Object.entries(manifest[componentType])
    .map(
      ([componentPath, componentModule]) => {
        if (
          !COMPONENT_NAME_REGEX.test(componentPath) ||
          !isValidIsland(componentPath)
        ) {
          return;
        }

        const { schema } = componentModule;
        const componentName = componentNameFromPath(componentPath);

        return {
          link: `/live/api/${componentType}/${componentName}`,
          component: componentName,
          componentLabel: schema?.title ?? componentName,
        };
      },
    ).filter(
      (componentPreviewData): componentPreviewData is ComponentPreview =>
        Boolean(componentPreviewData),
    );
  end("map-components");

  return new Response(JSON.stringify({ [componentType]: components }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "Server-Timing": printTimings(),
    },
  });
}

export function renderComponent(
  url: URL,
  componentName: string,
) {
  if (!isPrivateDomain(url.hostname)) {
    return new Response("Not found", { status: 404 });
  }

  const { start, end, printTimings } = createServerTiming();

  const manifest = getManifest();
  const Component = getComponentModule(manifest, componentName)?.default;
  if (!Component) {
    return new Response("Component Not Found", { status: 404 });
  }

  start("render-component");
  const html = renderToString(<Component />);
  end("render-component");

  return new Response(
    html,
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "Server-Timing": printTimings(),
      },
    },
  );
}
