import { propertyHasRef } from "./schema.ts";
import { context } from "../server.ts";

import { appendHash, loaderInstanceToProp } from "./loaders.ts";
import type { Loader, Page, PageData } from "../types.ts";

interface ComponentInstance {
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
export const COMPONENT_NAME_REGEX =
  /^(\.?\/islands|\.?\/sections|\.?\/loaders)?\/([\w\/]*)\.(tsx|jsx|js|ts)/;

export const BLOCKED_ISLANDS_SCHEMAS = new Set([
  "/Editor.tsx",
  "/InspectVSCode.tsx",
  "./islands/Editor.tsx",
  "./islands/InspectVSCode.tsx",
]);

export function filenameFromPath(path: string) {
  return path.replace(COMPONENT_NAME_REGEX, "$2");
}

export function isValidIsland(componentPath: string) {
  return !BLOCKED_ISLANDS_SCHEMAS.has(componentPath);
}

export const createLoadersForSection = (instance: ComponentInstance) => {
  const loaders = context.manifest?.loaders ?? {};
  const loadersByOutputSchema = Object
    .entries(loaders)
    .reduce(
      (acc, [key, loader]) => ({
        ...acc,
        [loader?.default?.outputSchema?.$ref]: {
          loader: loader.default,
          key,
        },
      }),
      {} as Record<string, { key: string; loader: Loader }>,
    );

  const definition = getDefinition(instance.key);
  if (!definition) {
    throw new Error(`Component ${instance.key} not found`);
  }

  const loaderInstances = Object
    .keys(definition.schema?.properties ?? {})
    .filter((propName) => propertyHasRef(definition.schema, propName))
    .map((propName) => {
      const outputSchema = (definition.schema?.properties?.[propName] as any)
        ?.$ref;

      const match = loadersByOutputSchema[outputSchema];

      if (!match) {
        throw new Error(
          `Loader for ${outputSchema} not found for <${instance}/>`,
        );
      }

      const loaderUniqueId = appendHash(outputSchema);
      instance.props[propName] = loaderInstanceToProp(loaderUniqueId);

      return {
        key: match.key,
        label: match.key,
        outputSchema: outputSchema,
        uniqueId: loaderUniqueId,
        props: {},
        schema: match.loader.inputSchema,
      };
    });

  return loaderInstances;
};

export const createSection = (sectionKey: string) => {
  const section: ComponentInstance = {
    key: sectionKey,
    label: sectionKey,
    uniqueId: sectionKey,
    props: {},
  };

  const loaders = createLoadersForSection(section);

  return {
    section,
    loaders,
  };
};

export const createPageForSection = (
  sectionName: string,
  data: PageData,
): Page => ({
  id: -1,
  name: sectionName,
  path: `/_live/sections/${sectionName}`,
  data,
  state: "dev",
});

const getDefinition = (path: string) => context.manifest?.sections[path];

export const exists = (path: string) => Boolean(getDefinition(path));
