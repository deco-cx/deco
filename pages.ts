import { context } from "$live/server.ts";
import { PageWithParams } from "$live/types.ts";
import getSupabaseClient from "./supabase.ts";

import { Page } from "./types.ts";
import { createPageForSection } from "./utils/page.ts";
import {
  createSectionFromSectionKey,
  doesSectionExist,
} from "./utils/manifest.ts";

export async function loadLivePage(
  req: Request
): Promise<PageWithParams | null> {
  const url = new URL(req.url);
  const pageIdParam = url.searchParams.get("pageId");
  const sectionName = url.searchParams.get("section"); // E.g: section=Banner.tsx
  const pageId = pageIdParam && parseInt(pageIdParam, 10);

  const pageWithParams = await ((): Promise<PageWithParams | null> => {
    if (sectionName) {
      return fetchPageFromSection(sectionName, context.siteId);
    }
    if (pageId) {
      return fetchPageFromId(pageId, url.pathname);
    }
    return fetchPageFromPathname(url.pathname, context.siteId);
  })();

  if (!pageWithParams) {
    return null;
  }

  return {
    ...pageWithParams,
    page: {
      ...pageWithParams?.page,
      data: {
        // TODO: Remove this after we eventually migrate everything
        functions: (
          pageWithParams?.page.data.functions ??
          (pageWithParams?.page.data as any).loaders
        )?.map((loader) => ({
          ...loader,
          key: loader.key.replace("./loaders", "./functions"),
        })),
        sections: (
          pageWithParams?.page.data.sections ??
          (pageWithParams?.page.data as any).components
        )?.map((section) => ({
          ...section,
          key: section.key.replace("./components/", "./sections/"),
        })),
      },
    },
  };
}

export const fetchPageFromPathname = async (
  path: string,
  siteId: number
): Promise<PageWithParams | null> => {
  const { data: pages, error } = await getSupabaseClient()
    .from<Page & { site: number }>("pages")
    .select("id, name, data, path, state")
    .eq("site", siteId)
    .eq("state", "published");

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
  pathname?: string
): Promise<PageWithParams> => {
  const { data: pages, error } = await getSupabaseClient()
    .from<Page>("pages")
    .select("id, name, data, path, state")
    .match({ id: pageId });

  const matchPage = pages?.[0];

  if (error || !matchPage) {
    throw new Error(error?.message || `Page with id ${pageId} not found`);
  }

  const urlPattern = new URLPattern({ pathname: matchPage.path });
  const params = pathname
    ? urlPattern.exec({ pathname })?.pathname.groups
    : undefined;

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
export const fetchPageFromSection = async (
  sectionFileName: string, // Ex: ./sections/Banner.tsx
  siteId: number
): Promise<PageWithParams> => {
  const supabase = getSupabaseClient();
  const sectionKey = `./sections/${sectionFileName}`;
  const { section: instance, functions } =
    createSectionFromSectionKey(sectionKey);

  const page = createPageForSection(sectionKey, {
    sections: [instance],
    functions,
  });

  if (!doesSectionExist(sectionKey)) {
    throw new Error(`Section at ${sectionFileName} Not Found`);
  }

  const { data } = await supabase
    .from<Page>("pages")
    .select("id, name, data, path, state")
    .match({ path: page.path, site: siteId });

  const match = data?.[0];

  if (match) {
    return { page: match };
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
