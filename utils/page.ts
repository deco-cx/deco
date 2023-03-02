import type { JSONSchema7, JSONSchema7Definition } from "json-schema";

import type {
  AvailableFunction,
  AvailableSection,
  EditorData,
  Page,
  PageData,
  PageSection,
} from "../types.ts";

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

/** Property is undefined | boolean | object, so if property[key] is === "object" and $id in property[key] */
export const propertyHasId = (
  propDefinition: JSONSchema7Definition | undefined,
): propDefinition is JSONSchema7 => (
  typeof propDefinition === "object" && "$id" in propDefinition
);

export const isNotNullOrUndefined = <T extends unknown>(
  item: T | null | undefined,
): item is T => item !== null && item !== undefined;

export type AvailableFunctionsForSection = Array<{
  sectionPropKey: string;
  sectionPropTitle?: string;
  availableFunctions: AvailableFunction[];
}>;

/**
 * Receives a section key (its path) and returns an array with every prop
 * that needs an external type (have $id) and its candidate functions
 *
 * TODO: Function that takes into account current page functions and return them as options.
 *  Used the data from the fn above
 */
export const availableFunctionsForSection = (
  section: AvailableSection,
  functions: AvailableFunction[],
): AvailableFunctionsForSection => {
  const functionsAvailableByOutputSchema$id: Record<
    string,
    AvailableFunction[]
  > = functions.reduce((acc, availableFunction) => {
    const dataAttr = availableFunction.outputSchema?.properties?.data;

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

    acc[functionType$Id].push(availableFunction);
    return acc;
  }, {} as Record<string, AvailableFunction[]>);

  const sectionInputSchema = section?.schema;

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

      const availableFunctions = prop$id
        ? functionsAvailableByOutputSchema$id[prop$id] || []
        : [];

      return {
        sectionPropKey,
        sectionPropTitle,
        availableFunctions,
      };
    })
    .filter(isNotNullOrUndefined);

  return availableFunctions;
};

export function addUniqueIdToEntity<
  T extends AvailableFunction | AvailableSection,
>(
  entity: T,
): T & { uniqueId: string } {
  return { ...entity, uniqueId: appendHash(entity.key) };
}

/**
 * Function used in the "delete section" flow, where we need to
 * calculate which associated functions for a section can be removed
 * from the page as well (if they're not being used elsewhere)
 */
export function getFunctionIdsOnlyUsedForSection(
  section: PageSection,
  allPageSections: PageSection[],
): string[] {
  const functionOcurrences: Record<string, number> = allPageSections.reduce(
    (acc, { props }) => {
      if (!props) {
        return acc;
      }
      Object.keys(props).forEach((propKey) => {
        const propValue = section?.props?.[propKey];

        if (!propValue || !isFunctionProp(propValue)) return;

        const functionUniqueId = propReferenceToFunctionKey(propValue);

        if (!acc[functionUniqueId]) {
          acc[functionUniqueId] = 0;
        }
        acc[functionUniqueId] += 1;
      });

      return acc;
    },
    {} as Record<string, number>,
  );
  return Object.keys(section.props ?? {}).reduce((acc, propKey) => {
    const propValue = section?.props?.[propKey];
    if (!propValue || !isFunctionProp(propValue)) return acc;

    const functionUniqueId = propReferenceToFunctionKey(propValue);

    const numberOfOcurrencedForFunction = functionOcurrences[functionUniqueId];

    if (numberOfOcurrencedForFunction === 1) {
      acc.push(functionUniqueId);
    }

    return acc;
  }, [] as string[]);
}

/**
 * For a given section, create copies of associated functions
 * to be added in the page as well.
 */
export function getSelectedFunctionsForDuplication({
  section,
  availableFunctions,
}: {
  section: PageSection;
  availableFunctions: AvailableFunction[];
}): Record<string, AvailableFunction> {
  return Object.keys(section.props ?? {}).reduce((acc, propKey) => {
    const propValue = section?.props?.[propKey];
    if (!propValue || !isFunctionProp(propValue)) return acc;

    const functionUniqueId = propReferenceToFunctionKey(propValue);

    const relatedFunction = availableFunctions.find(
      ({ uniqueId }) => uniqueId === functionUniqueId,
    );

    if (!relatedFunction) return acc;

    const { uniqueId: _, ...functionCopy } = relatedFunction;
    acc[propKey] = functionCopy;

    return acc;
  }, {} as Record<string, AvailableFunction>);
}

/**
 * When a new section is to be added in the page, we need to
 * calculate it's initial props to link section with functions,
 * and also potentially create new functions in the page.
 *
 * This function returns the necessary metadata for that to happen
 */
export const prepareSectionWithFunctions = ({
  selectedFunctions,
  selectedSection,
}: {
  selectedSection: AvailableSection;
  selectedFunctions: Record<string, AvailableFunction>;
}): {
  sectionToBeAdded: PageSection;
  functionsToBeAdded: Array<AvailableFunction & { uniqueId: string }>;
} => {
  const baseSection: PageSection = addUniqueIdToEntity(selectedSection);

  const { functionsToBeAdded, sectionInitialProps } = Object.keys(
    selectedFunctions,
  ).reduce(
    (acc, propKey) => {
      const fn = selectedFunctions[propKey];
      if (!fn) {
        return acc;
      }

      if (!fn.uniqueId) {
        const fnToBeAdded = addUniqueIdToEntity(fn);
        acc.functionsToBeAdded.push(fnToBeAdded);
        acc.sectionInitialProps[propKey] = functionUniqueIdToPropReference(
          fnToBeAdded.uniqueId,
        );

        return acc;
      } else {
        acc.sectionInitialProps[propKey] = functionUniqueIdToPropReference(
          fn.uniqueId,
        );

        return acc;
      }
    },
    { functionsToBeAdded: [], sectionInitialProps: {} } as {
      functionsToBeAdded: Array<AvailableFunction & { uniqueId: string }>;
      sectionInitialProps: Record<string, string>;
    },
  );

  const sectionToBeAdded = { ...baseSection, props: sectionInitialProps };

  return { sectionToBeAdded, functionsToBeAdded };
};

type SectionFunction = {
  functionIndex: number;
  function: EditorData["functions"][number];
};

/**
 * When a section is selected in the editor, we promptly display
 * the props editor for the native/normal props, but also the
 * form for associated function's props.
 */
export function getMetadataForSectionEditor({
  section,
  pageFunctions,
}: {
  section: EditorData["sections"][number];
  pageFunctions: EditorData["functions"];
}): {
  ownPropsSchema?: JSONSchema7;
  functionsForComponent?: SectionFunction[];
} {
  const sectionSchema = section.schema;
  if (!sectionSchema || !section) {
    return {};
  }

  const propsThatMapToLoader = Object.keys(section.props || {})
    .map((propKey) => {
      const propValue = section?.props?.[propKey]; // E.g: "Shelf Title" or "{vtexSearchResults-4ad5}"

      if (
        typeof propValue !== "string" ||
        !isFunctionProp(section.props?.[propKey])
      ) {
        return null;
      }

      const functionUniqueId = propReferenceToFunctionKey(propValue);

      return { propKey, functionUniqueId };
    })
    .filter(isNotNullOrUndefined);

  const schemaPropertiesWithoutThoseFromLoaders = Object.keys(
    sectionSchema.properties || {},
  )
    .filter((propKey) => !isFunctionProp(section?.props?.[propKey]))
    .reduce(
      (acc, cur) => ({
        ...acc,
        [cur]: sectionSchema.properties?.[cur] || {},
      }),
      {} as JSONSchema7["properties"],
    );

  const ownPropsSchema = {
    ...sectionSchema,
    properties: schemaPropertiesWithoutThoseFromLoaders,
  } as JSONSchema7;

  const functionsForComponent = propsThatMapToLoader
    .map(({ functionUniqueId }) => {
      const functionIndex = pageFunctions.findIndex(
        ({ uniqueId }) => functionUniqueId === uniqueId,
      );

      if (functionIndex < 0) {
        return null;
      }

      return {
        functionIndex,
        function: pageFunctions[functionIndex],
      };
    })
    .filter(isNotNullOrUndefined);

  return { ownPropsSchema, functionsForComponent };
}

export const createPageForSection = (
  sectionKey: string,
  data: PageData,
): Page => ({
  id: -1,
  name: sectionKey,
  // TODO: Use path join
  path: `/_live/workbench/sections/${sectionKey.replace("./sections/", "")}`,
  data,
  state: "dev",
});

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
