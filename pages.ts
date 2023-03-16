import { context } from "$live/live.ts";
import { PageSection, PageWithParams } from "$live/types.ts";
import getSupabaseClient from "./supabase.ts";
import { HandlerContext } from "$fresh/server.ts";
import { EditorData, LiveState, Page } from "$live/types.ts";
import {
  generateAvailableEntitiesFromManifest,
  loadPageData,
} from "$live/utils/manifest.ts";
import { createPageForSection } from "$live/utils/page.ts";
import {
  createSectionFromSectionKey,
  doesSectionExist,
} from "./utils/manifest.ts";
import { supabase } from "./deps.ts";

export interface PageOptions {
  selectedPageIds: number[];
}

export const sectionPathStart = "/_live/workbench/sections/";

export const isPageOptions = (x: any): x is PageOptions =>
  Array.isArray(x.selectedPageIds);

export async function loadLivePage({
  req,
  ctx,
  selectedPageIds,
  resolveGlobals = true,
}: {
  req: Request;
  ctx: HandlerContext<any, LiveState>;
  resolveGlobals?: boolean;
} & PageOptions): Promise<PageWithParams | null> {
  const url = new URL(req.url);
  const pageIdParam = url.searchParams.get("pageId");
  const blockName = url.searchParams.get("key");
  const pageId = pageIdParam && parseInt(pageIdParam, 10);
  let globals: Page[] = [];

  const pageWithParams = await (async (): Promise<PageWithParams | null> => {
    const { data: pages, error } = await getSupabaseClient()
      .from("pages")
      .select(`id, name, data, path, state, public`)
      .eq("site", context.siteId)
      .in("state", ["published", "draft", "global"]);

    globals = pages?.filter((page) => page.state === "global") ?? [];
    ctx.state.global = loadGlobal({ globalSettings: globals });

    if (blockName) {
      return fetchPageFromSection(blockName, context.siteId);
    }
    if (pageId) {
      return fetchPageFromId(pageId, url.pathname);
    }

    const candidatePages = getPageFromPathname({
      pages,
      error,
      path: url.pathname,
    });
    if (candidatePages && candidatePages.length !== 0) {
      let firstPublished;
      for (const candidatePage of candidatePages) {
        if (selectedPageIds.includes(candidatePage.page.id)) {
          return candidatePage;
        }
        // Retain support for "published" state while we migrate to "published flag" approach
        if (!firstPublished && candidatePage.page.state === "published") {
          firstPublished = candidatePage;
        }
      }
      return firstPublished as PageWithParams;
    }
    return null;
  })();

  if (!pageWithParams) {
    return null;
  }

  // Now, let's resolve any global sections which may be referenced by this page
  if (resolveGlobals) {
    for (const section of pageWithParams.page.data.sections) {
      // This section is a reference to a global section, let's find it
      if (section.key.startsWith(sectionPathStart)) {
        const [sectionPath] = section.key.split("@");
        // Look for an override from a feature flag in selectedPageIds
        let overrideGlobalSection = null;
        let overrideGlobalLoaders = null;
        for (const selectedPageId of selectedPageIds) {
          const selectedGlobalSectionPage = globals.find(
            (globalPage) =>
              globalPage.path.startsWith(sectionPath) &&
              globalPage.id === selectedPageId
          );
          if (selectedGlobalSectionPage) {
            overrideGlobalSection = selectedGlobalSectionPage.data
              .sections[0] as PageSection;
            overrideGlobalLoaders = selectedGlobalSectionPage.data.functions;
            break;
          }
        }
        // Look for a global section that matches provided section path exactly
        let byPathGlobalSection = null;
        let byPathGlobalLoaders = null;
        for (const globalPage of globals) {
          if (globalPage.path === section.key) {
            byPathGlobalSection = globalPage.data.sections[0] as PageSection;
            byPathGlobalLoaders = globalPage.data.functions;
            break;
          }
        }
        // Override this section key and props with found match
        const globalSection = overrideGlobalSection || byPathGlobalSection;
        const globalLoaders = overrideGlobalLoaders || byPathGlobalLoaders;
        if (globalSection) {
          section.key = globalSection.key;
          section.label = globalSection.label;
          section.props = globalSection.props;
          pageWithParams.page.data.functions = [
            ...(globalLoaders ?? []),
            ...(pageWithParams.page.data.functions ?? []),
          ];
        }
      }
    }
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

interface FetPageFromPathnameParams {
  pages: Page[] | null;
  error: supabase.PostgrestError | null;
  path: string;
}

const getPageFromPathname = ({
  pages,
  error,
  path,
}: FetPageFromPathnameParams): PageWithParams[] | null => {
  const routes = pages?.map((page) => ({
    page,
    pattern: page.path,
  })) as Array<{ pattern: string; page: Page }>;

  sortRoutes(routes);

  const matchRoutes = routes
    .map(({ pattern, page }) => {
      const urlPattern = new URLPattern({ pathname: pattern });
      const result = urlPattern.exec({ pathname: path });

      return { match: !!result, params: result?.pathname.groups, page };
    })
    .filter(({ match }) => match);

  if (error || matchRoutes.length === 0) {
    console.error(error?.message || `Page with path "${path}" not found`);

    return null;
  }

  return matchRoutes;
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
    .from("pages")
    .select("id, name, data, path, state, public")
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
  sectionFileName: string, // Ex: ./sections/Banner.tsx#TopSellers
  siteId: number
): Promise<PageWithParams> => {
  const supabase = getSupabaseClient();

  const { section: instance, functions } = createSectionFromSectionKey(
    sectionFileName,
  );

  const page = createPageForSection(sectionFileName, {
    sections: [instance],
    functions,
  });

  if (!doesSectionExist(sectionFileName)) {
    throw new Error(`Section at ${sectionFileName} Not Found`);
  }

  const { data } = await supabase
    .from("pages")
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
  const rankRoute = (pattern: string) =>
    pattern
      .split("/")
      .reduce(
        (acc, routePart) =>
          routePart.endsWith("*")
            ? acc
            : routePart.startsWith(":")
            ? acc + 1
            : acc + 2,
        0
      );

  routes.sort((a, b) => rankRoute(b.pattern) - rankRoute(a.pattern));
}

/**
 * Based on data from the backend and the page's manifest,
 * generates all the necessary information for the CMS
 *
 * TODO: After we approve this, move this function elsewhere
 */
export const generateEditorData = async <Data = unknown>(
  req: Request,
  ctx: HandlerContext<Data, LiveState>,
  options: PageOptions
): Promise<EditorData> => {
  const pageWithParams = await loadLivePage({
    req,
    ctx,
    resolveGlobals: false,
    ...options,
  });

  if (!pageWithParams) {
    throw new Error("Could not find page to generate editor data");
  }

  const {
    page,
    page: {
      data: { sections, functions },
    },
  } = pageWithParams;

  const sectionsWithSchema = sections.map(
    (section): EditorData["sections"][0] => ({
      ...section,
      schema: context.manifest?.schemas[section.key]?.inputSchema || undefined,
    })
  );

  const functionsWithSchema = functions.map(
    (functionData): EditorData["functions"][0] => ({
      ...functionData,
      schema:
        context.manifest?.schemas[functionData.key]?.inputSchema || undefined,
      outputSchema:
        context.manifest?.schemas[functionData.key]?.outputSchema || undefined,
    })
  );

  const { availableFunctions, availableSections } =
    generateAvailableEntitiesFromManifest();

  return {
    state: page.state,
    pageName: page.name,
    sections: sectionsWithSchema,
    functions: functionsWithSchema,
    availableSections,
    availableFunctions: [...availableFunctions, ...functionsWithSchema],
  };
};

export const loadPage = async <Data = unknown>(
  req: Request,
  ctx: HandlerContext<Data, LiveState>,
  options: PageOptions
) => {
  const { start, end } = ctx.state.t;

  start("load-page");
  // TODO: Ensure loadLivePage only goes to DB if there is a page published with this path
  // ... This will be possible when all published pages are synced to the edge
  // ... for now, we need to go to the DB every time, even when there's no data for this page
  const pageWithParams = await loadLivePage({ req, ctx, ...options });
  end("load-page");

  if (!pageWithParams) {
    return null;
  }
  // If there's a page match, populate ctx.state.page
  const { page, params = {} } = pageWithParams;

  start("load-data");
  const {
    pageData: pageDataAfterFunctions,
    headers,
    status,
  } = await loadPageData(
    req,
    {
      ...ctx,
      params,
    },
    page?.data
  );
  end("load-data");

  ctx.state.page = { ...page, data: pageDataAfterFunctions };

  return {
    page: ctx.state.page,
    headers,
    status,
  };
};

const loadGlobal = ({ globalSettings }: { globalSettings: Page[] }) => {
  // https://regex101.com/r/zSyTir/1
  const stripGlobalKey = (key: string) => {
    return key.replace(/(.*)\/(\w*)\.global\.tsx$/, "$2");
  };

  const globals = globalSettings.reduce((result, page: Page) => {
    const firstSection = page.data.sections?.[0];

    if (!firstSection) {
      return result;
    }

    const stripedKey = stripGlobalKey(firstSection.key);

    result[stripedKey] = firstSection.props;
    return result;
  }, {} as Record<string, unknown>);

  return Object.freeze(globals);
};
