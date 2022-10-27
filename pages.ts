import { HandlerContext } from "$fresh/server.ts";
import { PageData } from "$live/types.ts";
import { fetchPageFromId, fetchPageFromPathname } from "./utils/supabase.ts";
import { isLoaderProp, propToLoaderInstance } from "./utils/loaders.ts";
import { context } from "$live/server.ts";
import { path } from "./utils/path.ts";
import { Page } from "./types.ts";

export async function loadLivePage(
  req: Request,
  _: HandlerContext<PageData>
): Promise<Page> {
  const url = new URL(req.url);
  const pageId = parseInt(url.searchParams.get("pageId")!, 10);

  const page = pageId
    ? await fetchPageFromId(pageId, context.siteId)
    : await fetchPageFromPathname(url.pathname, context.siteId);

  return page;
}

export async function loadData(
  req: Request,
  ctx: HandlerContext<PageData>,
  pageData: PageData,
  start: (l: string) => void,
  end: (l: string) => void
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
    }) ?? []
  );

  const loadersResponseMap = loadersResponse.reduce(
    (result, currentResponse) => {
      result[currentResponse.uniqueId] = currentResponse.data;
      return result;
    },
    {} as Record<string, unknown>
  );

  const componentsWithData = pageData.components.map((componentData) => {
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
          propToLoaderInstance(propValue)
        );

        return { key: propKey, value: loaderValue };
      })
      .reduce((acc, cur) => ({ ...acc, [cur.key]: cur.value }), {});

    return { ...componentData, props: propsWithLoaderData };
  });

  return { ...pageData, components: componentsWithData };
}
