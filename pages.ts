import { HandlerContext } from "$fresh/server.ts";
import { context } from "$live/server.ts";
import { PageData, PageWithParams } from "$live/types.ts";
import getSupabaseClient from "./supabase.ts";

import { Page } from "./types.ts";
import {
  createSection,
  createPageForSection,
  exists,
} from "./utils/component.ts";
import { isLoaderProp, propToLoaderInstance } from "./utils/loaders.ts";
import { path } from "./utils/path.ts";

export async function loadLivePage(
  req: Request,
): Promise<PageWithParams | null> {
  const url = new URL(req.url);
  const pageIdParam = url.searchParams.get("pageId");
  const component = url.searchParams.get("component");
  const pageId = pageIdParam && parseInt(pageIdParam, 10);

  const pageWithParams = await ((): Promise<PageWithParams | null> => {
    if (component) {
      return fetchPageFromComponent(component, context.siteId);
    }
    if (pageId) {
      return fetchPageFromId(pageId, url.pathname);
    }
    return fetchPageFromPathname(url.pathname, context.siteId);
  })();

  if (!pageWithParams) {
    return null
  }

  return {
    ...pageWithParams,
    page: {
      ...pageWithParams?.page,
      data: {
        loaders: pageWithParams?.page.data.loaders,
        sections: (pageWithParams?.page.data.sections ?? (pageWithParams?.page.data as any).components)?.map(section => ({
          ...section,
          key: section.key.replace('./components/', './sections/')
        }))
      }
    }
  }
}

export async function loadData(
  req: Request,
  ctx: HandlerContext<Page>,
  pageData: PageData,
  start: (l: string) => void,
  end: (l: string) => void,
): Promise<PageData> {
  const loadersResponse = await Promise.all(
    pageData.loaders?.map(async ({ key, props, uniqueId }) => {
      const loaderFn = context.manifest!.loaders[key]?.default.loader;

      if (!loaderFn) {
        console.log(`Not found loader implementation for ${key}`);
      }

      start(`loader#${uniqueId}`);
      const loaderData = await loaderFn(req, ctx, props);
      end(`loader#${uniqueId}`);
      return {
        uniqueId,
        data: loaderData,
      };
    }) ?? [],
  );

  const loadersResponseMap = loadersResponse.reduce(
    (result, currentResponse) => {
      result[currentResponse.uniqueId] = currentResponse.data;
      return result;
    },
    {} as Record<string, unknown>,
  );

  const sectionsWithData = pageData.sections.map((componentData) => {
    /*
     * if any shallow prop that contains a mustache like `{loaderName.*}`,
     * then get the loaderData using path(loadersResponseMap, value.substring(1, value.length - 1))
     */

    const propsWithLoaderData = Object.keys(componentData.props || {})
      .map((propKey) => {
        const propValue = componentData.props?.[propKey];

        if (!isLoaderProp(propValue)) {
          return { key: propKey, value: propValue };
        }

        const loaderValue = path(
          loadersResponseMap,
          propToLoaderInstance(propValue),
        );

        return { key: propKey, value: loaderValue };
      })
      .reduce((acc, cur) => ({ ...acc, [cur.key]: cur.value }), {});

    return { ...componentData, props: propsWithLoaderData };
  });

  return { ...pageData, sections: sectionsWithData };
}

export const fetchPageFromPathname = async (
  path: string,
  siteId: number,
): Promise<PageWithParams | null> => {
  const { data: pages, error } = await getSupabaseClient()
    .from("pages")
    .select("id, name, data, path")
    .match({ site: siteId, archived: false })
    .is("flag", null)
    .is("archived", false);

  const routes = pages?.map((page) => ({
    page,
    pattern: page.path,
  })) as Array<{ pattern: string; page: Page }>;

  sortRoutes(routes);

  const matchRoute = routes
    .map(({ pattern, page }) => {
      const urlPattern = new URLPattern({ pathname: pattern });
      const result = urlPattern.exec({ pathname: path });

      return { match: !!result, params: result?.pathname.groups, page };
    })
    .find(({ match }) => match);

  if (error || !matchRoute) {
    console.error(error?.message || `Page with path "${path}" not found`);

    return null;
  }

  return matchRoute;
};

/**
 * Fetchs a specific page from the database and also
 * computes the page params base on the request's URL if provided
 */
export const fetchPageFromId = async (
  pageId: number,
  pathname?: string,
): Promise<PageWithParams> => {
  const { data: pages, error } = await getSupabaseClient()
    .from("pages")
    .select("id, name, data, path")
    .match({ id: pageId });

  const matchPage = pages?.[0];

  if (error || !matchPage) {
    throw new Error(error?.message || `Page with id ${pageId} not found`);
  }

  const urlPattern = new URLPattern({ pathname: matchPage.path });
  const params = pathname
    ? urlPattern.exec({ pathname })?.pathname.groups
    : undefined;

  console.log({ matchPage, params, pathname });
  return {
    page: matchPage as Page,
    params,
  };
};

/**
 * Fetches a page containing this component.
 *
 * This is used for creating the canvas. It retrieves
 * or generates a fake page from the database at
 * /_live/sections/<componentName.tsx>
 *
 * This way we can use the page editor to edit components too
 */
export const fetchPageFromComponent = async (
  component: string, // Ex: Banner.tsx
  siteId: number
): Promise<PageWithParams> => {
  const supabase = getSupabaseClient();
  const { section: instance, loaders } = createSection(
    `./sections/${component}`,
  );
  const page = createPageForSection(component, {
    sections: [instance],
    loaders,
  });

  if (!exists(`./sections/${component}`)) {
    throw new Error(`Section at ${component} Not Found`);
  }
  
  const { data } = await supabase
    .from<Page>("pages")
    .select("id, path")
    .match({ path: page.path, site: siteId });

  const match = data?.[0];

  if (match) {
    return fetchPageFromId(match.id);
  }

  return { page };
};

/**
 * Sort pages by their relative routing priority, based on the parts in the
 * route matcher
 *
 * Logic extracted from:
 * https://github.com/denoland/fresh/blob/046fcde959041ac9cd5f2b39671c819c4af5cc24/src/server/context.ts#L683
 */
export function sortRoutes<T extends { pattern: string }>(routes: T[]) {
  const rankRoute = (pattern: string) => {
    let routeScore = 0;
    const parts = pattern.split("/");
    parts.forEach((routePart) => {
      if (!routePart) {
        return;
      }
      if (routePart.endsWith("*")) {
        routeScore += 0;
      } else if (routePart.startsWith(":")) {
        routeScore += 1;
      } else {
        routeScore += 2;
      }
    });

    return routeScore;
  };
  routes.sort((a, z) => rankRoute(z.pattern) - rankRoute(a.pattern));
}
