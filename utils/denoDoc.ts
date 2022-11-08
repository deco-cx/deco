import { JSONSchema7 } from "json-schema";

/**
 * Transforms myPropName into "My Prop Name" for cases
 * when there's no label specified
 * 
 * TODO: Support i18n in the future
 */
const beautifyPropName = (propName: string) => {
  return propName
    // insert a space before all caps
    .replace(/([A-Z])/g, " $1")
    // uppercase the first character
    .replace(/^./, function (str) {
      return str.toUpperCase();
    });
};

export function getJsonSchemaFromDocs(
  docs: DenoDocResponse[],
  entityName?: string
): JSONSchema7 | null {
  const propsExport = docs.find(({ name }) => name === "Props");

  if (!propsExport) {
    console.log(
      `${entityName} doesn't export a Props interface definition, couldn't extract schema.`
    );
    return null;
  }

  const componentName = propsExport.location.filename
    .split("/")
    .pop()
    ?.replace(/\.ts(x|)/g, "");
  const properties = propsExport.interfaceDef?.properties;

  const jsonSchemaProperties = properties?.reduce((acc, cur) => {
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

    if (!propType) {
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
          baseProp.type = "array";
          baseProp.items = {
            type: "string",
            enum: cur.tsType.union?.map(({ repr }) => repr),
          };
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

  const baseJsonSchema: JSONSchema7 = {
    title: componentName,
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
  importDef?: ImportDef;
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
  typeParams: null;
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
