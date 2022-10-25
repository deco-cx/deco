import { HandlerContext } from "$fresh/server.ts";
import { PageData } from "$live/types.ts";
import { getPageFromId, getProdPage } from "./utils/supabase.ts";
import { isLoaderProp, propToLoaderInstance } from "./utils/loaders.ts";
import { context } from "$live/server.ts";
import { path } from "./utils/path.ts";
import { Page } from "./types.ts";

export const getPages = async (): Promise<Page[]> => {
  return await Promise.resolve([{ name: "default" }]);
};

export interface LoadLivePageOptions {
  template?: string;
}

export async function loadLivePage(
  req: Request,
  _: HandlerContext<PageData>,
  options?: LoadLivePageOptions,
): Promise<PageData> {
  const url = new URL(req.url);
  const { template } = options ?? {};
  const pageId = parseInt(url.searchParams.get("pageId")!, 10);

  // TODO: Aaaaaaaaaaa
  let pages = [];
  let pageData: Pick<PageData, "components" | "loaders"> = {
    components: [],
    loaders: [],
  };

  pages = pageId
    ? await getPageFromId(pageId, context.siteId)
    : await getProdPage(context.siteId, url.pathname, template);

  const page = pages![0];
  pageData = page?.data ?? {};

  if (page) {
    console.log("Live page:", url.pathname, pages[0]);
  } else {
    console.log("Live page not found", url.pathname, template);
  }

  const isEditor = url.searchParams.has("editor");

  const schemas: Record<string, any> = {};
  // map back components from database to components for the editor, merging loader props into component props
  const editorComponents = pageData.components?.map((componentData) => {
    schemas[componentData.component] =
      context.manifest?.schemas[componentData.component];
    if (!componentData.props) {
      return componentData;
    }

    const newComponentData = JSON.parse(JSON.stringify(componentData));

    for (const [propName, value] of Object.entries(newComponentData.props)) {
      if (isLoaderProp(value)) {
        const loaderName = propToLoaderInstance(value);
        newComponentData.props[propName] = JSON.parse(
          JSON.stringify(
            pageData.loaders.find(({ name }) => name === loaderName) ?? {},
          ),
        ).props;
      }
    }

    return newComponentData;
  });

  return {
    components: pageData.components ?? [],
    editorComponents,
    schemas,
    loaders: pageData.loaders ?? [],
    mode: isEditor ? "edit" : "none",
    template: options?.template || url.pathname,
    title: page?.name,
  };
}

export async function loadData(
  req: Request,
  ctx: HandlerContext<PageData>,
  pageData: PageData,
  start: (l: string) => void,
  end: (l: string) => void,
): Promise<void> {
  const loadersResponse = await Promise.all(
    pageData.loaders?.map(async ({ loader, props, name }) => {
      const loaderFn =
        context.manifest!.loaders[`./loaders/${loader}.ts`].default.loader;
      start(`loader#${name}`);
      const loaderData = await loaderFn(req, ctx, props);
      end(`loader#${name}`);
      return {
        name,
        data: loaderData,
      };
    }) ?? [],
  );

  const loadersResponseMap = loadersResponse.reduce(
    (result, currentResponse) => {
      result[currentResponse.name] = currentResponse.data;
      return result;
    },
    {} as Record<string, unknown>,
  );

  pageData.components = pageData.components.map((componentData) => {
    /*
     * if any shallow prop that contains a mustache like `{loaderName.*}`,
     * then get the loaderData using path(loadersResponseMap, value.substring(1, value.length - 1))
     */

    Object.values(componentData.props ?? {}).forEach((value) => {
      if (!isLoaderProp(value)) {
        return;
      }

      const loaderForwardedProps = path(
        loadersResponseMap,
        propToLoaderInstance(value),
      );

      componentData.props = {
        ...componentData.props,
        ...loaderForwardedProps,
      };
    });

    return componentData;
  });
}
