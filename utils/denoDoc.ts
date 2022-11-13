import { exec, OutputMode } from "https://deno.land/x/exec@0.0.5/mod.ts";
import { JSONSchema7 } from "json-schema";

/**
 * Transforms myPropName into "My Prop Name" for cases
 * when there's no label specified
 *
 * TODO: Support i18n in the future
 */
const beautifyPropName = (propName: string) => {
  return (
    propName
      // insert a space before all caps
      .replace(/([A-Z])/g, " $1")
      // uppercase the first character
      .replace(/^./, function (str) {
        return str.toUpperCase();
      })
  );
};

const getFieldFromJsDoc = (
  jsDoc: JSDoc | undefined,
  field: "label" | "description"
) => {
  return jsDoc?.tags
    ?.find(({ value }) => value.includes(`@${field}`))
    ?.value?.replace(`@${field} `, "");
};

/**
 * We use $id inside of schemas to match components and functions.
 *
 * This function is responsible for generating this $id from the
 * type's import URL
 *
 * E.g: importUrl: file:///Users/lucis/deco/live/std/commerce/types/Product.ts
 */
const get$idFromImportUrl = (importUrl: string) => {
  // TODO: Improve this to not include live's version when using deno.lan
  // E.g: live@0.1.16-functions/std/commerce/types/ProductList.ts
  return "live" + importUrl?.split("/live")[1];
};

export async function readDenoDocJson(filePath: string) {
  // TODO: Test on windows
  const { output: rawOutput } = await exec(`deno doc ${filePath} --json`, {
    output: OutputMode.Capture,
  });
  const denoDocOutput = JSON.parse(rawOutput);
  return denoDocOutput;
}

export function getFunctionOutputSchemaFromDocs(
  docs: DenoDocResponse[],
  entityName: string
) {
  const defaultFunctionExport = docs.find(
    ({ name, kind }) => name === "default" && kind === "variable"
  );

  if (!defaultFunctionExport) {
    console.log(
      `${entityName} should have a named function as the default export. Check the docs here: #TODO`
    );
  }

  const functionTsType = defaultFunctionExport?.variableDef?.tsType;
  const functionTypeName = functionTsType?.repr; // E.g: LoaderFunction

  const VALID_FUNCTION_TYPES = ["LoaderFunction"];

  if (
    !functionTypeName ||
    !functionTsType ||
    !VALID_FUNCTION_TYPES.includes(functionTypeName)
  ) {
    console.log(
      `${entityName} should export a function with one of Live's provided types: LoaderFunction.`
    );

    return null;
  }

  const outputTypeName = functionTsType?.typeRef?.typeParams?.map(
    ({ repr }) => repr
  )[1]; // E.g: Product

  if (!outputTypeName && functionTypeName === "LoaderFunction") {
    console.log(
      `${entityName} should specify its return type like this: LoaderFunction<Props, Product>, where Product is the return type.`
    );
    return null;
  }

  const outputTypeUrl = docs.find(
    ({ kind, name }) => kind === "import" && name === outputTypeName
  )?.importDef?.src; // E.g: file:///Users/lucis/deco/live/std/commerce/types/Product.ts

  if (!outputTypeUrl) {
    console.log(
      `Couldn't find import for output type '${outputTypeName}' in ${entityName}.`
    );
    return null;
  }

  const typeId = get$idFromImportUrl(outputTypeUrl);

  const outputSchema: JSONSchema7 = {
    type: "object",
    properties: {
      data: {
        $id: typeId,
      },
    },
    // Technically, this function might return additional data (like headers and status), but
    // they don't matter for the schema now
    additionalProperties: true,
  };

  return outputSchema;
}

export function getInputSchemaFromDocs(
  docs: DenoDocResponse[],
  entityName?: string
): JSONSchema7 | null {
  const propsExport = docs.find(({ name }) => name === "Props");

  if (!propsExport) {
    entityName &&
      console.log(
        `${entityName} doesn't export a Props interface definition, couldn't extract schema.`
      );
  }

  const defaultExport = docs.find(({ name }) => name === "default");

  const fileName = defaultExport?.location.filename
    .split("/")
    .pop()
    ?.replace(/\.ts(x|)/g, "");

  const properties = propsExport?.interfaceDef?.properties ?? [];

  const jsonSchemaProperties = properties.reduce((acc, cur) => {
    const propName = cur.name;
    const propType = cur.tsType.repr as "string" | "number" | "array" | "";

    const specifiedLabel = cur.jsDoc?.tags
      ?.find(({ value }) => value.includes("@label"))
      ?.value?.replace("@label", "")
      .trim();

    const title = specifiedLabel || beautifyPropName(propName);

    const baseProp: JSONSchema7 = {
      title,
      type: propType || "string",
    };

    const isComplexType = cur.tsType.kind === "typeRef";

    if (!propType || isComplexType) {
      // Some options: Inline object (typeLiteral), enum (kind: union)
      switch (cur.tsType.kind) {
        case "typeLiteral": {
          // Probably need to handle with arrays as well
          const innerProperties = cur.tsType.typeLiteral?.properties?.reduce(
            (acc, { name, tsType }) => {
              const type = tsType.repr as "string" | "number";
              return {
                ...acc,
                [name]: {
                  // TODO: Support annotated @label here as well (recursion?)
                  title: beautifyPropName(name),
                  type,
                },
              };
            },
            {} as JSONSchema7["properties"]
          );
          baseProp.type = "object";
          baseProp.properties = innerProperties;
          break;
        }
        case "union": {
          // E.g: { state: 'open' | 'false' }
          baseProp.type = "array";
          baseProp.items = {
            type: "string",
            enum: cur.tsType.union?.map(({ repr }) => repr),
          };
          break;
        }
        case "typeRef": {
          // E.g: { productsResponse: ProductList }
          const typeName = cur.tsType.repr;
          const typeImportUrl = docs.find(
            ({ kind, name }) => kind === "import" && name === typeName
          )?.importDef?.src;

          if (!typeImportUrl) {
            console.log(
              `${entityName} declares dependency on a type that is not being imported in this file.`
            );
            return acc;
          }

          const typeId = get$idFromImportUrl(typeImportUrl);

          baseProp.$id = typeId;
          baseProp.type = undefined;
        }
      }
    }

    return {
      ...acc,
      [propName]: {
        ...baseProp,
      },
    };
  }, {} as JSONSchema7["properties"]);

  const jsDoc = defaultExport?.jsDoc;
  const optionalLabel = getFieldFromJsDoc(jsDoc, "label");
  const optionalDescription = getFieldFromJsDoc(jsDoc, "description");

  const baseJsonSchema: JSONSchema7 = {
    title: optionalLabel || fileName,
    description: optionalDescription,
    type: "object",
  };

  const componentSchema: JSONSchema7 = {
    ...baseJsonSchema,
    properties: jsonSchemaProperties,
  };

  return componentSchema;
}

export interface DenoDocResponse {
  kind: string;
  name: string;
  location: Location;
  declarationKind: string;
  interfaceDef?: InterfaceDef;
  functionDef?: FunctionDef;
  variableDef?: VariableDef;
  importDef?: ImportDef;
  jsDoc?: JSDoc;
}
export interface VariableDef {
  tsType: TsTypeElement;
  kind: string;
}

export interface TsTypeElement {
  repr: string;
  kind: string;
  typeRef: TypeRef;
}

export interface FunctionDef {
  params: Param[];
  returnType: null;
  hasBody: boolean;
  isAsync: boolean;
  isGenerator: boolean;
  typeParams: any[];
}

export interface Param {
  kind: string;
  props: Prop[];
  optional: boolean;
  tsType: TsType;
}

export interface Prop {
  kind: string;
  key: string;
  value: null;
}

export interface TsType {
  repr: string;
  kind: string;
  typeRef: TypeRef;
}

export interface TypeRef {
  typeParams: null | Array<TsTypeElement>;
  typeName: string;
}

export interface ImportDef {
  src: string;
  imported: string;
}

export interface InterfaceDef {
  extends: any[];
  methods: any[];
  properties: InterfaceDefProperty[];
  callSignatures: any[];
  indexSignatures: any[];
  typeParams: any[];
}

export interface InterfaceDefProperty {
  name: string;
  location: Location;
  params: any[];
  computed: boolean;
  optional: boolean;
  tsType: PurpleTsType;
  typeParams: any[];
  jsDoc?: JSDoc;
}

export interface JSDoc {
  tags: Tag[];
}

export interface Tag {
  kind: string;
  value: string;
}

export interface Location {
  filename: Filename;
  line: number;
  col: number;
}

export type Filename = string;

export interface PurpleTsType {
  repr: string;
  kind: string;
  keyword?: string;
  array?: TsType;
  union?: Union[];
  typeLiteral?: TypeLiteral;
}

export interface TypeLiteral {
  methods: any[];
  properties: TypeLiteralProperty[];
  callSignatures: any[];
  indexSignatures: any[];
}

export interface TypeLiteralProperty {
  name: string;
  params: any[];
  computed: boolean;
  optional: boolean;
  tsType: FluffyTsType;
  typeParams: any[];
}

export interface FluffyTsType {
  repr: string;
  kind: string;
  keyword: string;
}

export interface Union {
  repr: string;
  kind: string;
  literal: Literal;
}

export interface Literal {
  kind: string;
  string: string;
}
