/**
 * TODO (mcandeia)
 * This file should be deleted as soon as we have all stores migrated to live major v1 and we have dropped the admin support for the v0 major.
 */

import { Resolvable } from "$live/engine/core/resolver.ts";
import { Schemas } from "$live/engine/schema/builder.ts";
import { getCurrent } from "$live/engine/schema/reader.ts";
import { Audience } from "$live/flags/audience.ts";
import { EveryoneConfig } from "$live/flags/everyone.ts";
import { context } from "$live/live.ts";
import {
  AvailableFunction,
  AvailableSection,
  EditorData,
  PageState,
} from "$live/types.ts";
import { defaultHeaders } from "$live/utils/http.ts";
import { filenameFromPath } from "$live/utils/page.ts";
import {
  JSONSchema7,
  JSONSchema7TypeName,
} from "https://esm.sh/v103/@types/json-schema@7.0.11/index.d.ts";

const mockEffectSelectPage: AvailableFunction = {
  "key": "$live/functions/EffectSelectPage.ts",
  "label": "$live/functions/EffectSelectPage.ts",
  "props": {},
  "schema": {
    "title": " Effect Select Page",
    "type": "object" as JSONSchema7TypeName,
    "properties": {
      "pageIds": {
        "type": "array",
        "items": {
          "type": "number",
        },
        "title": "Page Ids",
      },
    },
    "required": [
      "pageIds",
    ],
  },
};
type Props = Record<string, unknown>;
interface Page {
  name: string;
  path: string;
  state: PageState;
  sections: Array<{ __resolveType: string } & Props>;
}

const withoutNamespace = (key: string) =>
  key.replace(`${context.namespace}/`, `./`);

export const redirectTo = (url: URL) =>
  Response.json(
    {},
    {
      status: 302,
      headers: {
        ...defaultHeaders,
        "Location": url.toString(),
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, *",
      },
    },
  );

function generateAvailableEntitiesFromManifest(schemas: Schemas) {
  const availableSections = Object.keys(context.manifest?.sections || {}).map(
    (componentKey) => {
      const [input] = getInputAndOutputFromKey(schemas, componentKey);
      const label = filenameFromPath(componentKey);

      // TODO: Should we extract defaultProps from the schema here?

      return {
        key: withoutNamespace(componentKey),
        label,
        props: {},
        schema: input,
      } as EditorData["availableSections"][0];
    },
  );

  const availableFunctions = Object.keys({
    ...context.manifest?.functions ?? {},
    ...context.manifest?.matchers ?? {},
  }).map(
    (functionKey) => {
      const key = functionKey.replace("matchers", "functions");
      const [inputSchema, outputSchema] = getInputAndOutputFromKey(
        schemas,
        functionKey,
      );
      const label = filenameFromPath(
        key,
      );

      return {
        key: withoutNamespace(key),
        label,
        props: generatePropsForSchema(inputSchema),
        schema: inputSchema,
        // TODO: Centralize this logic
        outputSchema: outputSchema,
      } as EditorData["availableFunctions"][0];
    },
  );

  return {
    availableSections,
    availableFunctions: [mockEffectSelectPage, ...availableFunctions],
  };
}

const configTypeFromJSONSchema = (schema: JSONSchema7): string | undefined => {
  if (!schema.allOf || schema.allOf.length === 0) {
    return undefined;
  }
  return (schema.allOf[0] as JSONSchema7).$ref;
};

const keyFromRef = (ref: string): string => {
  return ref.split("/")[2];
};

const flat = (
  def: JSONSchema7,
  schema: Schemas,
  memo: Record<string, JSONSchema7>,
): JSONSchema7 => {
  const ref = def?.$ref;
  if (ref && memo[ref]) {
    return memo[ref];
  }
  if (def?.$ref) {
    def = flat(schema.definitions[keyFromRef(def.$ref)], schema, memo);
  }
  if (!def) {
    return def;
  }
  if (def.allOf) {
    def.allOf = def.allOf.map((v) => flat(v as JSONSchema7, schema, memo));
  }
  if (def.anyOf && def.anyOf.length > 0) {
    const isFunctionReturn =
      (def.anyOf[0] as JSONSchema7)?.$id === "Resolvable";
    if (isFunctionReturn) {
      return {
        properties: {
          returnType: {
            const: ref ? btoa(ref) : "__MISSING__",
          },
        },
        format: "live-function",
        type: "string",
        title: def.title,
      };
    }
    return {
      ...def,
      anyOf: def.anyOf.map((obj) => flat(obj as JSONSchema7, schema, memo)),
    };
  }
  if (def.type === "array") {
    return { ...def, items: flat(def.items as JSONSchema7, schema, memo) };
  }
  const props: Record<string, JSONSchema7> = {};
  for (const [propName, propValue] of Object.entries(def?.properties ?? {})) {
    const flatObj = flat(propValue as JSONSchema7, schema, memo);
    if (flatObj?.anyOf && flatObj.anyOf.length > 0) {
      const funcRef = (flatObj.anyOf as JSONSchema7[]).find((schema) =>
        schema.format === "live-function"
      );
      if (funcRef) {
        props[propName] = { ...flatObj, anyOf: undefined, ...funcRef };
        continue;
      }
    }
    props[propName] = flatObj;
  }
  const resp = {
    ...def,
    properties: Object.keys(props).length > 0 ? props : undefined,
  };
  if (ref) {
    memo[ref] = resp;
  }
  return resp;
};
const memo = {};
const getInputAndOutputFromKey = (
  schema: Schemas,
  key: string,
): [JSONSchema7 | undefined, JSONSchema7 | undefined] => {
  const sanitized = key.replace("./", `${context.namespace!}/`);
  const definitionKey = btoa(sanitized);
  const inputDefinition = schema.definitions[definitionKey];
  const configType = configTypeFromJSONSchema(inputDefinition ?? {});
  const returnedByFunc = Object.entries(schema.definitions).find(([_, obj]) => {
    const anyOf = obj.anyOf as JSONSchema7[];
    if (!anyOf || anyOf.length === 0) {
      return false;
    }
    return anyOf.some((obj) => {
      const resolveType = obj?.properties?.["__resolveType"] as
        | JSONSchema7
        | undefined;
      if (!resolveType) {
        return false;
      }
      return resolveType?.default === sanitized;
    });
  });
  return [
    configType ? flat({ $ref: configType }, schema, memo) : undefined,
    returnedByFunc
      ? {
        "type": "object",
        "properties": {
          "data": {
            "$id": btoa(`#/definitions/${returnedByFunc[0]}`),
          },
        },
        "additionalProperties": true,
      }
      : undefined,
  ];
};

// TODO: Should we extract defaultProps from the schema here?
const generatePropsForSchema = (
  schema: JSONSchema7 | null | undefined,
) => {
  if (schema?.type == null || Array.isArray(schema.type)) {
    return null;
  }

  const cases: Record<string, unknown> = {
    object: {},
    array: [],
    boolean: true,
    number: 0,
    integer: 0,
    null: null,
  };
  return cases[schema.type] ?? null;
};

const globalSections = async (): Promise<AvailableSection[]> => {
  const blocks = await context.configStore!.state();
  const availableSections: AvailableSection[] = [];

  for (const [blockId, block] of Object.entries(blocks)) {
    if (block?.__resolveType?.includes("/sections/")) { //FIXME(mcandeia) should test against #/root/sections is Section
      availableSections.push({
        label: `${blockId}`,
        key: blockId,
      });
    }
  }

  return availableSections;
};
const labelOf = (resolveType: string): string => {
  const parts = resolveType.split("/");
  const [label] = parts[parts.length - 1].split("."); // the name of the file
  return label;
};
export const generateEditorData = async (
  url: URL,
): Promise<EditorData> => {
  const schema = await getCurrent();

  const allPages = await pages();
  let page: Pick<Page, "sections" | "state" | "name"> = {
    sections: [],
    state: "published",
    name: "Home",
  };

  const pageId = url.searchParams.get("pageId");
  if (pageId !== null) {
    page = await pageById(pageId);
  }

  const { sections } = page;

  const uniqueCount: Record<string, string> = {};
  const [sectionsWithSchema, functions] = sections.reduce(
    ([secs, funcs], section, i) => {
      const { __resolveType, ...props } = section;
      const [input] = getInputAndOutputFromKey(schema, __resolveType);
      const newProps: typeof props = {};
      const newFuncs = [];

      // map from __resolveType format to editor section format.
      // e.g __resolveType: deco-sites/std/functions/vtexProductListingPage.ts => {deco-sites/std/functions/vtexProductListingPage.ts}
      // and extract to the functions array in the root object.
      for (const [propKey, propValue] of Object.entries(props)) {
        const { __resolveType: resolveType, ...funcProps } = propValue as {
          __resolveType: string;
        };
        if (
          !resolveType
        ) {
          newProps[propKey] = propValue;
        } else {
          if (resolveType.endsWith("ts") || resolveType.endsWith("tsx")) {
            const propsUniq = JSON.stringify(props);
            uniqueCount[propsUniq] ??= String(
              newFuncs.length +
                funcs.length,
            ).padEnd(4, "0");
            const uniqueId = `${resolveType}-${
              uniqueCount[propsUniq]
            }` as string;
            newProps[propKey] = `{${uniqueId}}`;
            newFuncs.push({
              key: withoutNamespace(resolveType),
              label: labelOf(resolveType),
              props: funcProps,
              uniqueId,
            });
          } else { // global section
            const page = allPages[resolveType];
            if (!page) {
              continue;
            }
            return [[...secs, {
              key: page.path,
              label: page.name,
              type: "global",
              uniqueId: page.path,
            }], funcs];
          }
        }
      }

      const mappedSection = {
        key: withoutNamespace(__resolveType),
        label: labelOf(__resolveType),
        uniqueId: `${__resolveType}-${i}`,
        props: newProps,
        schema: input,
      };
      return [[...secs, mappedSection], [...funcs, ...newFuncs]];
    },
    [[], []] as [
      EditorData["sections"][0][],
      EditorData["availableFunctions"][0][],
    ],
  );

  const functionsWithSchema = functions.map(
    (functionData): EditorData["functions"][0] => {
      const [input, output] = getInputAndOutputFromKey(
        schema,
        functionData.key,
      );
      const key = withoutNamespace(functionData.key);

      return ({
        ...functionData,
        key,
        uniqueId: functionData.uniqueId!,
        schema: input,
        outputSchema: output,
      });
    },
  );

  const { availableFunctions, availableSections } =
    generateAvailableEntitiesFromManifest(schema);
  return {
    state: page?.state,
    pageName: page.name,
    sections: sectionsWithSchema,
    functions: functionsWithSchema,
    availableSections: [...availableSections, ...await globalSections()],
    availableFunctions: [...availableFunctions, ...functionsWithSchema],
  };
};

export const getPagePathTemplate = async (pageId: string | number) => {
  const matchPage = await pageById(pageId);

  if (!matchPage) {
    throw new Error(`Page with id ${pageId} not found`);
  }

  return matchPage.path;
};

const flagsThatContainsRoutes = [
  "$live/flags/audience.ts",
  "$live/flags/everyone.ts",
];

const livePage = "$live/pages/LivePage.tsx";

async function pages() {
  const archivedPromise = context.configStore!.archived()
    .then(
      (allArchivedBlocks) => {
        const archivedPages: Record<string, Resolvable> = {};
        for (const [blockId, block] of Object.entries(allArchivedBlocks)) {
          if (
            (block as { __resolveType: string })?.__resolveType === livePage
          ) {
            archivedPages[blockId] = { ...block, state: "archived" };
          }
        }
        return archivedPages;
      },
    );
  const blocks = await context.configStore!.state();
  const flags: (Audience | EveryoneConfig)[] = Object.values(blocks).filter((
    { __resolveType },
  ) => flagsThatContainsRoutes.includes(__resolveType));
  // pages that are assigned to at least one route are considered published
  const publishedPages = flags.reduce(
    (published, flag) => {
      return Object.values(flag.routes ?? {}).reduce((pb, route) => {
        const pageResolveType =
          (route as unknown as { page: { __resolveType: string } })
            ?.page?.__resolveType;
        if (!pageResolveType) {
          return pb;
        }
        return { ...pb, [pageResolveType]: true };
      }, published);
    },
    {} as Record<string, boolean>,
  );

  const newPages: Record<string, Page> = {};
  for (const [pageId, page] of Object.entries(blocks)) {
    if (page?.__resolveType === livePage) {
      newPages[pageId] = {
        ...page,
        state: publishedPages[pageId] ? "published" : "draft",
      };
    }
  }
  return { ...newPages, ...(await archivedPromise) };
}

async function pageById(pageId: string | number): Promise<Page> {
  return (await pages())[pageId];
}
