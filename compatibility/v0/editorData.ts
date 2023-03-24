import { Schemas } from "$live/engine/schema/builder.ts";
import { context } from "$live/live.ts";
import getSupabaseClient from "$live/supabase.ts";
import { EditorData, Page, PageWithParams } from "$live/types.ts";
import { filenameFromPath } from "$live/utils/page.ts";
import { join } from "https://deno.land/std@0.170.0/path/mod.ts";
import { JSONSchema7 } from "https://esm.sh/v103/@types/json-schema@7.0.11/index.d.ts";

export async function loadPage({
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
  if (def.anyOf && def.anyOf.length > 0) {
    const isFunctionReturn =
      (def.anyOf[0] as JSONSchema7)?.$id === "Resolvable";
    if (isFunctionReturn) {
      return {
        "$id": ref ? btoa(ref) : "MISSING",
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
    props[propName] = flat(propValue as JSONSchema7, schema, memo);
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

let schemas: Promise<Schemas> | null = null;
/**
 * Based on data from the backend and the page's manifest,
 * generates all the necessary information for the CMS
 *
 * TODO: After we approve this, move this function elsewhere
 */
export const generateEditorData = async (
  url: URL,
  pageId: string,
): Promise<EditorData> => {
  const pageWithParams = await loadPage({ url, pageId });

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

  const schema = await schemas;

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
