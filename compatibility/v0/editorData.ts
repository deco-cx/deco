import { Schemas } from "$live/engine/schema/builder.ts";
import { context } from "$live/live.ts";
import getSupabaseClient from "$live/supabase.ts";
import {
  AvailableFunction,
  AvailableSection,
  EditorData,
  JSONSchemaDefinition,
  Page,
  PageData,
  PageFunction,
  PageWithParams,
} from "$live/types.ts";
import { filenameFromPath } from "$live/utils/page.ts";
import { join } from "https://deno.land/std@0.170.0/path/mod.ts";
import { JSONSchema7 } from "https://esm.sh/v103/@types/json-schema@7.0.11/index.d.ts";
import { mapPage } from "$live/engine/configstore/supabaseLegacy.ts";

export const redirectTo = (url: URL) =>
  Response.json(
    {},
    {
      status: 302,
      headers: {
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
        key: componentKey,
        label,
        props: {},
        schema: input,
      } as EditorData["availableSections"][0];
    },
  );

  const availableFunctions = Object.keys(context.manifest?.functions || {}).map(
    (functionKey) => {
      const [inputSchema, outputSchema] = getInputAndOutputFromKey(
        schemas,
        functionKey,
      );
      const label = filenameFromPath(functionKey);

      return {
        key: functionKey,
        label,
        props: generatePropsForSchema(inputSchema),
        schema: inputSchema,
        // TODO: Centralize this logic
        outputSchema: outputSchema,
      } as EditorData["availableFunctions"][0];
    },
  );

  return { availableSections, availableFunctions };
}

async function loadPage({
  url: { pathname },
  pageId,
}: {
  pageId: string;
  url: URL;
}): Promise<PageWithParams | null> {
  const { data: page, error } = await getSupabaseClient()
    .from("pages")
    .select(`id, name, data, path, state, public`)
    .eq("site", context.siteId)
    .in("state", ["published", "draft", "global"])
    .match({ id: +pageId }).maybeSingle();
  if (error || page === null) {
    throw new Error(error?.message || `Page with id ${pageId} not found`);
  }
  const urlPattern = new URLPattern({ pathname: page.path });
  const params = pathname
    ? urlPattern.exec({ pathname })?.pathname.groups
    : undefined;

  return {
    page: page as Page,
    params,
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
        "$id": ref ? btoa(ref) : "__MISSING__",
        "format": "live-function",
        "type": "string",
        "title": def.title,
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

interface SectionInstance {
  key: string;
  label: string;
  uniqueId: string;
  props: Record<string, unknown>;
}

type CreateSectionFromSectionKeyReturn = {
  section: SectionInstance;
  functions: PageFunction[];
};

type SelectDefaultFunctionReturn = {
  sectionProps: Record<string, unknown>;
  newFunctionsToAdd: Array<PageFunction>;
};
type AvailableFunctionsForSection = Array<{
  sectionPropKey: string;
  sectionPropTitle?: string;
  availableFunctions: AvailableFunction[];
}>;

/** Property is undefined | boolean | object, so if property[key] is === "object" and $id in property[key] */
const propertyHasId = (
  propDefinition: JSONSchemaDefinition | undefined,
): propDefinition is JSONSchema7 => (
  typeof propDefinition === "object" && "$id" in propDefinition
);

const isNotNullOrUndefined = <T extends unknown>(
  item: T | null | undefined,
): item is T => item !== null && item !== undefined;

/**
 * Receives a section key (its path) and returns an array with every prop
 * that needs an external type (have $id) and its candidate functions
 *
 * TODO: Function that takes into account current page functions and return them as options.
 *  Used the data from the fn above
 */
const availableFunctionsForSection = (
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

const appendHash = (value: string) =>
  `${value}-${crypto.randomUUID().slice(0, 4)}`;

const functionUniqueIdToPropReference = (uniqueId: string) => `{${uniqueId}}`;

const createFunctionInstanceFromFunctionKey = (
  schema: Schemas,
  functionKey: string,
): PageFunction => {
  // TODO: Make sure that dev.ts is adding top-level title to inputSchema
  const [inputSchema] = getInputAndOutputFromKey(schema, functionKey);
  const functionLabel = inputSchema?.title ?? functionKey;

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
 * This function should be used only in the initial stage of the product.
 *
 * Since we don't yet have an UI to select which function a sections should bind
 * itself to (for each one of the props that might require this),
 * this utility function selects the first one available.
 */
const selectDefaultFunctionsForSection = (
  schemas: Schemas,
  section: AvailableSection,
): SelectDefaultFunctionReturn => {
  // TODO: Double check this logic here
  const [sectionInputSchema] = getInputAndOutputFromKey(schemas, section.key);

  if (!sectionInputSchema) {
    return {
      sectionProps: {},
      newFunctionsToAdd: [],
    };
  }

  const { availableFunctions } = generateAvailableEntitiesFromManifest(schemas);
  const functionsToChooseFrom = availableFunctionsForSection(
    section,
    availableFunctions,
  );

  const returnData = functionsToChooseFrom.reduce(
    (acc, { availableFunctions, sectionPropKey }) => {
      const chosenFunctionKey = availableFunctions[0].key;
      if (!chosenFunctionKey) {
        console.log(
          `Couldn't find a function for prop ${sectionPropKey} of section ${section.key}.`,
        );
        return acc;
      }

      const functionInstance = createFunctionInstanceFromFunctionKey(
        schemas,
        chosenFunctionKey,
      );

      acc.newFunctionsToAdd.push(functionInstance);
      acc.sectionProps[sectionPropKey] = functionUniqueIdToPropReference(
        chosenFunctionKey,
      );
      return acc;
    },
    {
      sectionProps: {},
      newFunctionsToAdd: [],
    } as SelectDefaultFunctionReturn,
  );

  return returnData;
};

/**
 * Used to generate dev pages (/_live/Banner.tsx), adding new functions to the page if necessary
 */
const createSectionFromSectionKey = (
  schemas: Schemas,
  sectionKey: string,
  sectionName?: string,
): CreateSectionFromSectionKeyReturn => {
  const section: SectionInstance = {
    key: sectionKey,
    label: sectionKey + sectionName ? ` (${sectionName})` : "",
    uniqueId: sectionKey,
    props: {},
  };

  const { newFunctionsToAdd, sectionProps } = selectDefaultFunctionsForSection(
    schemas,
    section,
  );

  section.props = sectionProps;

  return {
    section,
    functions: newFunctionsToAdd,
  };
};
const getSectionPath = (sectionKey: string) =>
  `/_live/workbench/sections/${
    sectionKey.replace(`${context.namespace}/sections/`, "")
  }`;

const createPageForSection = (
  sectionKey: string,
  data: PageData,
): Page => ({
  id: -1,
  name: sectionKey,
  // TODO: Use path join
  path: getSectionPath(sectionKey),
  data,
  state: "dev",
});

const getDefinition = (path: string) => context.manifest?.sections?.[path];

const doesSectionExist = (path: string) =>
  Boolean(getDefinition(path.replace("./", `${context.namespace}/`)));

/**
 * Fetches a page containing this component.
 *
 * This is used for creating the canvas. It retrieves
 * or generates a fake page from the database at
 * /_live/sections/<componentName.tsx>
 *
 * This way we can use the page editor to edit components too
 */
const pageFromSectionKey = async (
  schemas: Schemas,
  sectionFileName: string, // Ex: ./sections/Banner.tsx#TopSellers
): Promise<PageWithParams> => {
  const supabase = getSupabaseClient();

  const { section: instance, functions } = createSectionFromSectionKey(
    schemas,
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
    .match({ path: page.path, site: context.siteId });

  const match = data?.[0];

  if (match) {
    return { page: match };
  }

  return { page };
};

let schemas: Promise<Schemas> | null = null;

export const redirectToPreviewSection = async (url: URL, key: string) => {
  schemas ??= Deno.readTextFile(join(Deno.cwd(), "schemas.gen.json")).then(
    JSON.parse,
  );
  const schema = await schemas;
  const pageData = await pageFromSectionKey(schema, key);
  const converted = mapPage(context.namespace!, pageData.page);
  const { __resolveType: _ignore, ...sectionProps } = converted.sections[0];
  const propsBase64 = btoa(JSON.stringify(sectionProps ?? {}));

  url.pathname = `/live/previews/${key}`;
  url.searchParams.append("props", propsBase64);
  return redirectTo(url);
};

export const generateEditorData = async (
  url: URL,
): Promise<EditorData> => {
  schemas ??= Deno.readTextFile(join(Deno.cwd(), "schemas.gen.json")).then(
    JSON.parse,
  );
  const schema = await schemas;

  let pageWithParams = null;

  const pageId = url.searchParams.get("pageId");
  if (pageId !== null) {
    pageWithParams = await loadPage({ url, pageId });
  }
  const blockKey = url.searchParams.get("key");
  if (!pageWithParams && blockKey !== null) {
    pageWithParams = await pageFromSectionKey(schema, blockKey);
  }

  if (!pageWithParams) {
    throw new Error("Could not find page to generate editor data");
  }

  const {
    page,
    page: {
      data: { sections, functions },
    },
  } = pageWithParams;
  schemas ??= Deno.readTextFile(join(Deno.cwd(), "schemas.gen.json")).then(
    JSON.parse,
  );

  const sectionsWithSchema = sections.map(
    (section): EditorData["sections"][0] => {
      const [input] = getInputAndOutputFromKey(schema, section.key);

      return ({
        ...section,
        schema: input,
      });
    },
  );

  const functionsWithSchema = functions.map(
    (functionData): EditorData["functions"][0] => {
      const [input, output] = getInputAndOutputFromKey(
        schema,
        functionData.key,
      );

      return ({
        ...functionData,
        schema: input,
        outputSchema: output,
      });
    },
  );

  const { availableFunctions, availableSections } =
    generateAvailableEntitiesFromManifest(schema);

  return {
    state: page.state,
    pageName: page.name,
    sections: sectionsWithSchema,
    functions: functionsWithSchema,
    availableSections,
    availableFunctions: [...availableFunctions, ...functionsWithSchema],
  };
};

export const getPagePathTemplate = async (pageId: string | number) => {
  const { data: pages, error } = await getSupabaseClient()
    .from("pages")
    .select("id, name, data, path, state, public")
    .match({ id: +pageId });

  const matchPage = pages?.[0];

  if (error || !matchPage) {
    throw new Error(error?.message || `Page with id ${pageId} not found`);
  }

  return matchPage.path;
};
