import { HandlerContext } from "$fresh/server.ts";
import { renderToString } from "preact-render-to-string";
import { getSupabaseClientForUser } from "./supabase.ts";
import type { DecoManifest } from "./types.ts";
import {
  COMPONENT_NAME_REGEX,
  componentNameFromPath,
  getComponentModule,
  isValidIsland,
} from "./utils/component.ts";
import { createServerTiming } from "./utils/serverTimings.ts";

type Options = {
  userOptions: {
    siteId: number;
  };
};

export async function updateComponentProps(
  req: Request,
  _: HandlerContext,
  { userOptions }: Options,
) {
  let status;

  try {
    const { components, template } = await req.json();

    if (!userOptions.siteId) {
      // TODO: fetch site id from supabase
    }

    // TODO: Validate components props on schema

    const res = await getSupabaseClientForUser(req).from("pages").update({
      components: components,
    }).match({ site: userOptions.siteId, path: template });

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
  manifest: DecoManifest,
  componentType: "components" | "islands",
) {
  const { start, end, printTimings } = createServerTiming();

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
  manifest: DecoManifest,
  componentName: string,
) {
  const { start, end, printTimings } = createServerTiming();

  const Component = getComponentModule(manifest, componentName)?.default;
  if (!Component) {
    return new Response("Component Not Found", { status: 400 });
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
