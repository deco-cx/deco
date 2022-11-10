import type { JSONSchema7, JSONSchema7Definition } from "json-schema";
import { HandlerContext } from "$fresh/server.ts";
import { context } from "../server.ts";

import type { Page, PageData, PageFunction } from "../types.ts";

interface SectionInstance {
  key: string;
  label: string;
  uniqueId: string;
  props: Record<string, unknown>;
}

/**
 * TODO: There's probably a file util for that
 */
// Valid expressions: https://regex101.com/r/7sPtnb/1
// /Component.tsx
// ./components/Foo.tsx
// /islands/Foo.tsx
// ./islands/Foo.tsx
// ./components/deep/Test.tsx
export const PAGE_ENTITY_NAME_REGEX =
  /^(\.?\/islands|\.?\/sections|\.?\/functions)?\/([\w\/]*)\.(tsx|jsx|js|ts)/;

export const BLOCKED_ISLANDS_SCHEMAS = new Set([
  "/Editor.tsx",
  "/InspectVSCode.tsx",
  "./islands/Editor.tsx",
  "./islands/InspectVSCode.tsx",
]);

export function filenameFromPath(path: string) {
  return path.replace(PAGE_ENTITY_NAME_REGEX, "$2");
}

export function isValidIsland(componentPath: string) {
  return !BLOCKED_ISLANDS_SCHEMAS.has(componentPath);
}

export const propertyHasId = (
  propDefinition: JSONSchema7Definition | undefined
) => {
  // Property is undefined | boolean | object, so if property[key] is === "object" and $id in property[key]
  return (
    typeof propDefinition === "object" &&
    "$id" in (propDefinition as JSONSchema7)
  );
};

export const isNotNullOrUndefined = <T extends unknown>(
  item: T | null | undefined
): item is T => item !== null && item !== undefined;

type AvailableFunctionsForSection = Array<{
  sectionPropKey: string;
  sectionPropTitle?: string;
  availableFunctionKeys: string[];
}>;

/**
 * Receives a section key (its path) and returns an array with every prop
 * that needs an external type (have $id) and its candidate functions
 *
 * TODO: Function that takes into account current page functions and return them as options.
 *  Used the data from the fn above
 */
export const availableFunctionsForSection = (
  sectionKey: string
): AvailableFunctionsForSection => {
  const functions = context.manifest?.functions ?? {};

  const functionsAvailableByOutputSchema$id: Record<string, string[]> =
    Object.entries(functions).reduce((acc, [key]) => {
      const functionOutputSchema = context.manifest?.schemas[key]?.outputSchema;
      const dataAttr = functionOutputSchema?.properties?.data;

      if (typeof dataAttr !== "object") {
        return acc;
      }

      const functionType$Id = dataAttr.$id; // E.g: live/std/commerce/ProductList.ts

      if (!functionType$Id) {
        return acc;
      }

      if (!acc[functionType$Id]) {
        acc[functionType$Id] = [];
      }

      acc[functionType$Id].push(key);
      return acc;
    }, {} as Record<string, string[]>);

  const sectionInputSchema =
    context?.manifest?.schemas[sectionKey]?.inputSchema;

  if (!sectionInputSchema) {
    return [];
  }

  const availableFunctions = Object.keys(sectionInputSchema.properties ?? {})
    .filter((propName) =>
      propertyHasId(sectionInputSchema.properties?.[propName])
    )
    .map((sectionPropKey) => {
      const propDefinition = sectionInputSchema.properties?.[sectionPropKey];
      if (typeof propDefinition !== "object") {
        return null;
      }

      const sectionPropTitle = propDefinition.title;
      const prop$id = propDefinition.$id;

      const availableFunctionKeys = prop$id
        ? functionsAvailableByOutputSchema$id[prop$id] || []
        : [];

      return {
        sectionPropKey,
        sectionPropTitle,
        availableFunctionKeys,
      };
    })
    .filter(isNotNullOrUndefined);

  return availableFunctions;
};

export const createFunctionInstanceFromFunctionKey = (
  functionKey: string
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

type SelectDefaultFunctionReturn = {
  sectionProps: Record<string, unknown>;
  newFunctionsToAdd: Array<PageFunction>;
};
/**
 * This function should be used only in the initial stage of the product.
 *
 * Since we don't yet have an UI to select which function a sections should bind
 * itself to (for each one of the props that might require this),
 * this utility function selects the first one available.
 *
 */
export const selectDefaultFunctionsForSection = (
  sectionKey: string
): SelectDefaultFunctionReturn => {
  const sectionInputSchema =
    context?.manifest?.schemas[sectionKey]?.inputSchema;

  if (!sectionInputSchema) {
    return {
      sectionProps: {},
      newFunctionsToAdd: [],
    };
  }

  const availableFunctions = availableFunctionsForSection(sectionKey);

  const returnData = availableFunctions.reduce(
    (acc, { availableFunctionKeys, sectionPropKey }) => {
      const chosenFunctionKey = availableFunctionKeys[0];
      if (!chosenFunctionKey) {
        console.log(
          `Couldn't find a function for prop ${sectionPropKey} of section ${sectionKey}.`
        );
        return acc;
      }

      const functionInstance =
        createFunctionInstanceFromFunctionKey(chosenFunctionKey);

      acc.newFunctionsToAdd.push(functionInstance);
      acc.sectionProps[sectionPropKey] =
        functionUniqueIdToPropReference(chosenFunctionKey);
      return acc;
    },
    {
      sectionProps: {},
      newFunctionsToAdd: [],
    } as SelectDefaultFunctionReturn
  );

  return returnData;
};

type CreateSectionFromSectionKeyReturn = {
  section: SectionInstance;
  functions: PageFunction[];
};

/**
 * Used to generate dev pages (/_live/Banner.tsx), adding new functions to the page if necessary
 */
export const createSectionFromSectionKey = (
  sectionKey: string
): CreateSectionFromSectionKeyReturn => {
  const { newFunctionsToAdd, sectionProps } =
    selectDefaultFunctionsForSection(sectionKey);

  const section: SectionInstance = {
    key: sectionKey,
    label: sectionKey,
    uniqueId: sectionKey,
    props: sectionProps,
  };

  return {
    section,
    functions: newFunctionsToAdd,
  };
};

export const createPageForSection = (
  sectionName: string,
  data: PageData
): Page => ({
  id: -1,
  name: sectionName,
  path: `/_live/sections/${sectionName}`,
  data,
});

export async function loadPageData(
  req: Request,
  ctx: HandlerContext<Page>,
  pageData: PageData,
  start: (l: string) => void,
  end: (l: string) => void
): Promise<PageData> {
  const functionsResponse = await Promise.all(
    pageData.functions?.map(async ({ key, props, uniqueId }) => {
      const loaderFn = context.manifest!.functions[key]?.default;

      if (!loaderFn) {
        console.log(`Not found function implementation for ${key}`);
        return { uniqueId, data: null };
      }

      start(`loader#${uniqueId}`);
      // TODO: Set status and headers
      const {
        data,
        headers: _headers,
        status: _status,
      } = await loaderFn(req, ctx, props);
      end(`loader#${uniqueId}`);

      return {
        uniqueId,
        data,
      };
    }) ?? []
  );

  const loadersResponseMap = functionsResponse.reduce(
    (result, currentResponse) => {
      result[currentResponse.uniqueId] = currentResponse.data;
      return result;
    },
    {} as Record<string, unknown>
  );

  const sectionsWithData = pageData.sections.map((componentData) => {
    /*
     * if any shallow prop that contains a mustache like `{functionName.*}`,
     * then get the functionData using path(functionResponseMap, value.substring(1, value.length - 1))
     */

    const propsWithLoaderData = Object.keys(componentData.props || {})
      .map((propKey) => {
        const propValue = componentData.props?.[propKey];

        if (!isFunctionProp(propValue)) {
          return { key: propKey, value: propValue };
        }

        const loaderValue = path(
          loadersResponseMap,
          propReferenceToFunctionKey(propValue)
        );

        return { key: propKey, value: loaderValue };
      })
      .reduce((acc, cur) => ({ ...acc, [cur.key]: cur.value }), {});

    return { ...componentData, props: propsWithLoaderData };
  });

  return { ...pageData, sections: sectionsWithData };
}

const getDefinition = (path: string) => context.manifest?.sections[path];

export const doesSectionExist = (path: string) => Boolean(getDefinition(path));

export const isFunctionProp = (value: unknown): value is string =>
  typeof value === "string" &&
  value.charAt(0) === "{" &&
  value.charAt(value.length - 1) === "}";

export const functionUniqueIdToPropReference = (uniqueId: string) =>
  `{${uniqueId}}`;

export const propReferenceToFunctionKey = (prop: string) =>
  prop.substring(1, prop.length - 1);

export const appendHash = (value: string) =>
  `${value}-${crypto.randomUUID().slice(0, 4)}`;

export const path = (obj: Record<string, any>, path: string) => {
  const pathList = path.split(".").filter(Boolean);
  let result = obj;

  pathList.forEach((key) => {
    if (!result[key]) {
      return result[key];
    }

    result = result[key];
  });

  return result;
};
