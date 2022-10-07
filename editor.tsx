import { HandlerContext } from "$fresh/server.ts";
import { ASSET_CACHE_BUST_KEY } from "$fresh/runtime.ts";
import { renderToString } from "preact-render-to-string";
import LiveContext from "./context.ts";
import { getSupabaseClientForUser } from "./supabase.ts";
import { Flag, Module } from "./types.ts";
import {
  componentNameFromPath,
  getComponentModule,
} from "./utils/component.ts";
import { createServerTiming } from "./utils/serverTimings.ts";
import { duplicateProdPage, getFlagFromPageId } from "./utils/supabase.ts";

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
  let pageId;
  let supabaseReponse;

  try {
    const { components, template, siteId, variantId, experiment } = await req
      .json();

    pageId = variantId
      ? variantId
      : await duplicateProdPage(req, url.pathname, template, siteId);

    const flag: Flag = await getFlagFromPageId(req, pageId, siteId);
    flag.traffic = (experiment as boolean) ? 0.5 : 0;

    supabaseReponse = await getSupabaseClientForUser(req).from("pages").update({
      components: components,
    }).match({ id: pageId });

    if (supabaseReponse.error) {
      throw new Error(supabaseReponse.error.message);
    }

    supabaseReponse = await getSupabaseClientForUser(req).from("flags").update({
      traffic: flag.traffic,
    }).match({ id: flag.id });

    if (supabaseReponse.error) {
      throw new Error(supabaseReponse.error.message);
    }

    status = supabaseReponse.status;
  } catch (e) {
    console.error(e);
    status = 400;
  }

  return Response.json({ variantId: pageId }, { status });
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

  return Response.json({ components, islands }, {
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
    return new Response("Component Not Found", {
      status: 404,
    });
  }

  let html = "";
  start("render-component");

  const render = () => {
    html = renderToString(<Component />);

    // TODO: handle hydration
    // https://github.com/denoland/fresh/blob/1b3c9f2569c5d56a6d37c366cb5940f26b7e131e/plugins/twind.ts#L24

    return {
      htmlText: html,
      requiresHydration: false,
    };
  };

  const twindPlugin = LiveContext.getLiveOptions().plugins?.find((plugin) => {
    return plugin.name === "twind";
  });

  try {
    if (twindPlugin) {
      // Mimic the fresh render function that run plugins.render
      // https://github.com/denoland/fresh/blob/main/src/server/render.ts#L174
      const res = twindPlugin.render?.({
        render,
      }) ?? {};

      if (res.styles) {
        const [style] = res.styles;

        const styleNode = (
          <style
            id={style.id}
            dangerouslySetInnerHTML={{ __html: style.cssText }}
            media={style.media}
          />
        );

        const styleString = renderToString(styleNode);
        html = styleString + html;
      }
    } else {
      render();
    }
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
