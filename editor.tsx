import { HandlerContext } from "$fresh/server.ts";
import { ASSET_CACHE_BUST_KEY } from "$fresh/runtime.ts";
import { renderToString } from "preact-render-to-string";
import LiveContext from "./context.ts";
import getSupabaseClient, { getSupabaseClientForUser } from "./supabase.ts";
import type {
  Flag,
  Module,
  PageComponentData,
  PageDataData,
  PageLoaderData,
} from "./types.ts";
import {
  componentNameFromPath,
  getComponentModule,
} from "./utils/component.ts";
import { createServerTiming } from "./utils/serverTimings.ts";
import { duplicateProdPage, getFlagFromPageId } from "./utils/supabase.ts";
import type { JSONSchema7 } from "json-schema";
import {
  generateLoaderInstance,
  loaderInstanceToProp,
  loaderPathToKey,
} from "./utils/loaders.ts";
import type { LivePageData } from "./live.tsx";

const ONE_YEAR_CACHE = "public, max-age=31536000, immutable";

/**
 * @description This function creates a loaders list based on component props that depends on Loaders.
 *  Also, mutate prop that depends on Loaders to component[index].props.[propName] = `loadername-uuid`
 */
const generateLoadersFromComponents = (
  _: Request,
  __: URL,
  ctx: any,
): PageDataData => {
  const { components: ctxComponents } = ctx;
  const components = JSON.parse(JSON.stringify(ctxComponents));
  const loaders: PageLoaderData[] = [];
  const manifest = LiveContext.getManifest();

  for (const component of components) {
    const componentSchema = manifest.schemas[component.component];

    if (!componentSchema) {
      continue;
    }

    const propsThatRequireLoader = Object.entries(
      componentSchema.properties ?? {},
    )
      .filter((entry): entry is [
        string,
        JSONSchema7 & { $ref: NonNullable<JSONSchema7["$ref"]> },
      ] => Boolean((entry[1] as JSONSchema7).$ref));

    propsThatRequireLoader.forEach(([property, propertySchema]) => {
      // Match property ref input into loader output
      const [loaderPath] = Object.entries(manifest.loaders).find((
        [, loader],
      ) => loader.default.outputSchema.$ref === propertySchema.$ref) ?? [];

      if (!loaderPath) {
        throw new Error(
          `Doesn't exists loader with this $ref: ${propertySchema.$ref}`,
        );
      }

      if (!component.props) {
        component.props = {};
      }

      const loaderProp = component.props[property] ?? {};
      const loaderInstanceName = generateLoaderInstance(propertySchema.$ref);
      component.props[property] = loaderInstanceToProp(loaderInstanceName);

      loaders.push({
        loader: loaderPathToKey(loaderPath),
        name: loaderInstanceName,
        props: loaderProp,
      });
    });
  }

  return { loaders, components };
};

const updateDraft = async (
  req: Request,
  pathname: string,
  ctx: EditorRequestData & EditorLoaders,
) => {
  const { components, template, siteId, variantId, experiment, loaders } = ctx;

  let supabaseReponse;
  const pageId = variantId
    ? variantId
    : await duplicateProdPage(pathname, template, siteId);

  const flag: Flag = await getFlagFromPageId(pageId, siteId);
  flag.traffic = experiment ? 0.5 : 0;

  supabaseReponse = await getSupabaseClientForUser(req).from("pages").update({
    components: { components, loaders },
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

  return { pageId, status: supabaseReponse.status };
};

const updateProd = async (
  req: Request,
  pathname: string,
  ctx: EditorRequestData & { pageId: number | string },
) => {
  const { template, siteId, pageId } = ctx;
  let supabaseResponse;

  const queries = [pathname, template]
    .filter((query) => Boolean(query))
    .map((query) => `path.eq.${query}`)
    .join(",");

  // Archive prod
  supabaseResponse = await getSupabaseClientForUser(req)
    .from("pages")
    .update({
      archived: true,
    })
    .match({ site: siteId })
    .is("flag", null)
    .is("archived", false)
    .or(queries);

  if (supabaseResponse.error) {
    throw new Error(supabaseResponse.error.message);
  }

  // Promote variant to prod
  supabaseResponse = await getSupabaseClientForUser(req)
    .from("pages")
    .update({
      archived: false,
      flag: null,
    })
    .eq("id", pageId);

  if (supabaseResponse.error) {
    throw new Error(supabaseResponse.error.message);
  }

  return { pageId, status: supabaseResponse.status };
};

export type Audience = "draft" | "public";

interface EditorRequestData {
  components: PageComponentData[];
  siteId: number;
  template?: string;
  experiment: number;
  audience: Audience;
  variantId: string | null;
}

interface EditorLoaders {
  loaders: PageLoaderData[];
}

export async function updateComponentProps(
  req: Request,
  _: HandlerContext<LivePageData>,
) {
  const { start, end, printTimings } = createServerTiming();
  const url = new URL(req.url);
  if (!LiveContext.isPrivateDomain(url.hostname)) {
    return new Response("Not found", { status: 404 });
  }

  let response: { pageId: string | number; status: number } = {
    pageId: "",
    status: 0,
  };
  try {
    const ctx = await req.json() as EditorRequestData;

    start("generating-loaders");
    const { loaders, components } = generateLoadersFromComponents(
      req,
      url,
      ctx,
    );
    ctx.components = components;
    end("generating-loaders");

    start("saving-data");
    const { data: Pages, error } = await getSupabaseClient()
      .from("pages")
      .select("flag")
      .match({ id: ctx.variantId });

    const isProd = !Pages?.[0]!.flag;

    if (isProd) {
      ctx.variantId = null;
    }

    const referer = req.headers.get("referer");

    if (!referer && !ctx.template) {
      throw new Error("Referer or template not found");
    }

    const refererPathname = referer ? new URL(referer).pathname : "";
    const shouldDeployProd = !isProd && ctx.audience == "public" &&
      !ctx.experiment;
    response = await updateDraft(req, refererPathname, { ...ctx, loaders });

    // Deploy production
    if (shouldDeployProd) {
      response = await updateProd(req, refererPathname, {
        ...ctx,
        pageId: response.pageId,
      });
    }
    end("saving-data");
  } catch (e) {
    console.error(e);
    response.status = 400;
  }

  return Response.json({ variantId: response.pageId }, {
    status: response.status,
    headers: {
      "Server-Timing": printTimings(),
    },
  });
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
