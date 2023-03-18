import { HandlerContext } from "$fresh/server.ts";
import { context } from "$live/live.ts";

import type { LiveState, PageData, PageFunction } from "$live/types.ts";

import { LoaderFunction } from "$live/types.ts";
import {
  appendHash,
  isFunctionProp,
  propReferenceToFunctionKey,
} from "$live/utils/page.ts";
import {
  DEFAULT_CACHE_CONTROL,
  formatCacheControl,
  formatVary,
  mergeCacheControl,
  parseCacheControl,
  parseVary,
} from "./http.ts";

export const createFunctionInstanceFromFunctionKey = (
  functionKey: string,
): PageFunction => {
  // TODO: Make sure that dev.ts is adding top-level title to inputSchema
  const functionLabel =
    context.manifest?.schemas[functionKey]?.inputSchema?.title ?? functionKey;

  const uniqueId = appendHash(functionKey);

  // TODO: Get initial props from introspecting JSON Schema
  const initialProps = {};

  const functionInstance: PageFunction = {
    key: functionKey,
    label: functionLabel,
    uniqueId,
    props: initialProps,
  };

  return functionInstance;
};

/**
 * The database may have more functions than what's referenced by the sections.
 * Maybe, this is due to a bug on the live editor's interface. Anyways, it's always
 * good to prune and only run the necessary functions once
 */
const pruneFunctions = (data: PageData) => {
  const { sections, functions } = data;
  const str = JSON.stringify(sections);

  const functionsMap = new Map<string, PageData["functions"][number]>();

  for (const fn of functions) {
    if (str.includes(fn.uniqueId)) {
      functionsMap.set(fn.uniqueId, fn);
    }
  }

  return [...functionsMap.values()];
};

export async function loadPageData<Data, State extends LiveState>(
  req: Request,
  ctx: HandlerContext<Data, State>,
  pageData: PageData,
): Promise<{ pageData: PageData; headers: Headers; status: number }> {
  const { start, end } = ctx.state.t;
  const functionsResponse = await Promise.all(
    pruneFunctions(pageData).map(async ({ key, props, uniqueId }) => {
      const functionFn = context.manifest!.functions[key]
        ?.default as LoaderFunction<any, any, unknown>;

      if (!functionFn) {
        console.log(`Not found function implementation for ${key}`);
        return { uniqueId, data: null };
      }

      start(`function#${uniqueId}`);
      const { data, headers, status } = await functionFn(req, ctx, props);
      end(`function#${uniqueId}`);

      return {
        uniqueId,
        data,
        headers,
        status,
      };
    }),
  );

  const functionsResponseByUniqueId = functionsResponse.reduce(
    (result, currentResponse) => {
      result[currentResponse.uniqueId] = currentResponse.data;
      return result;
    },
    {} as Record<string, unknown>,
  );

  const cacheControl = functionsResponse.reduce((acc, response) => {
    const parsed = response.headers && parseCacheControl(response.headers);
    return parsed ? mergeCacheControl(acc, parsed) : acc;
  }, DEFAULT_CACHE_CONTROL);

  const vary = functionsResponse.reduce((acc, response) => {
    const parsed = response.headers && parseVary(response.headers);
    return parsed ? [...acc, ...parsed] : acc;
  }, [] as string[]);

  const status = functionsResponse.reduce(
    (acc, { status: responseStatus = 200 }) =>
      acc > responseStatus ? acc : responseStatus,
    200,
  );

  const sectionsWithData = pageData.sections.map((componentData) => {
    /*
     * if any shallow prop that contains a mustache like `{functionName.*}`,
     * then get the functionData using path(functionResponseMap, value.substring(1, value.length - 1))
     */

    const propsWithFunctionData = Object.keys(componentData.props || {})
      .map((propKey) => {
        const propValue = componentData.props?.[propKey];

        if (!isFunctionProp(propValue)) {
          return { key: propKey, value: propValue };
        }

        // In the future, we'll need to be more smart here (something like Liqui)
        const functionValue =
          functionsResponseByUniqueId[propReferenceToFunctionKey(propValue)];

        return { key: propKey, value: functionValue };
      })
      .reduce((acc, cur) => ({ ...acc, [cur.key]: cur.value }), {});

    return { ...componentData, props: propsWithFunctionData };
  });

  return {
    pageData: { ...pageData, sections: sectionsWithData },
    status,
    headers: new Headers({
      "cache-control": formatCacheControl(cacheControl),
      vary: formatVary(Array.from(new Set(vary))),
    }),
  };
}

const getDefinition = (path: string) => context.manifest?.sections[path];

export const doesSectionExist = (path: string) => Boolean(getDefinition(path));

interface SectionInstance {
  key: string;
  label: string;
  uniqueId: string;
  props: Record<string, unknown>;
}
