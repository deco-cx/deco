import { JSONSchema7 } from "json-schema";

export function getJsonSchemaFromDocs(
  docs: DenoDocResponse[]
): JSONSchema7 | null {
  const propsExport = docs.find(({ name }) => name === "Props");

  if (!propsExport) {
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
    console.log(cur.jsDoc?.tags);
    const title = cur.jsDoc?.tags
      ?.find(({ value }) => value.includes("@label"))
      ?.value?.replace("@label", "")
      .trim();

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

export enum Filename {
  FileUsersLucisDecoFashionComponentsProductShelfDTsx = "file:///Users/lucis/deco/fashion/components/ProductShelfD.tsx",
}

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

console.log(
  JSON.stringify(
    getJsonSchemaFromDocs([
      {
        kind: "interface",
        name: "Props",
        location: {
          filename:
            "file:///Users/lucis/deco/fashion/components/ProductShelfD.tsx",
          line: 4,
          col: 0,
        },
        declarationKind: "export",
        interfaceDef: {
          extends: [],
          methods: [],
          properties: [
            {
              name: "collection",
              location: {
                filename:
                  "file:///Users/lucis/deco/fashion/components/ProductShelfD.tsx",
                line: 6,
                col: 2,
              },
              params: [],
              computed: false,
              optional: false,
              tsType: {
                repr: "string",
                kind: "keyword",
                keyword: "string",
              },
              typeParams: [],
            },
            {
              name: "title",
              location: {
                filename:
                  "file:///Users/lucis/deco/fashion/components/ProductShelfD.tsx",
                line: 11,
                col: 2,
              },
              jsDoc: {
                tags: [
                  {
                    kind: "unsupported",
                    value: "@label Title",
                  },
                  {
                    kind: "unsupported",
                    value: "@show false",
                  },
                ],
              },
              params: [],
              computed: false,
              optional: false,
              tsType: {
                repr: "string",
                kind: "keyword",
                keyword: "string",
              },
              typeParams: [],
            },
            {
              name: "products",
              location: {
                filename:
                  "file:///Users/lucis/deco/fashion/components/ProductShelfD.tsx",
                line: 13,
                col: 2,
              },
              params: [],
              computed: false,
              optional: false,
              tsType: {
                repr: "",
                kind: "array",
                array: {
                  repr: "Product",
                  kind: "typeRef",
                  typeRef: {
                    typeParams: null,
                    typeName: "Product",
                  },
                },
              },
              typeParams: [],
            },
            {
              name: "customOptions",
              location: {
                filename:
                  "file:///Users/lucis/deco/fashion/components/ProductShelfD.tsx",
                line: 14,
                col: 2,
              },
              params: [],
              computed: false,
              optional: false,
              tsType: {
                repr: "",
                kind: "union",
                union: [
                  {
                    repr: "option_1",
                    kind: "literal",
                    literal: {
                      kind: "string",
                      string: "option_1",
                    },
                  },
                  {
                    repr: "option_2",
                    kind: "literal",
                    literal: {
                      kind: "string",
                      string: "option_2",
                    },
                  },
                  {
                    repr: "option_3",
                    kind: "literal",
                    literal: {
                      kind: "string",
                      string: "option_3",
                    },
                  },
                ],
              },
              typeParams: [],
            },
            {
              name: "myNumber",
              location: {
                filename:
                  "file:///Users/lucis/deco/fashion/components/ProductShelfD.tsx",
                line: 15,
                col: 2,
              },
              params: [],
              computed: false,
              optional: false,
              tsType: {
                repr: "number",
                kind: "keyword",
                keyword: "number",
              },
              typeParams: [],
            },
            {
              name: "myObj",
              location: {
                filename:
                  "file:///Users/lucis/deco/fashion/components/ProductShelfD.tsx",
                line: 16,
                col: 2,
              },
              params: [],
              computed: false,
              optional: false,
              tsType: {
                repr: "",
                kind: "typeLiteral",
                typeLiteral: {
                  methods: [],
                  properties: [
                    {
                      name: "innerProp",
                      params: [],
                      computed: false,
                      optional: false,
                      tsType: {
                        repr: "string",
                        kind: "keyword",
                        keyword: "string",
                      },
                      typeParams: [],
                    },
                  ],
                  callSignatures: [],
                  indexSignatures: [],
                },
              },
              typeParams: [],
            },
          ],
          callSignatures: [],
          indexSignatures: [],
          typeParams: [],
        },
      },
      {
        kind: "function",
        name: "default",
        location: {
          filename:
            "file:///Users/lucis/deco/fashion/components/ProductShelfD.tsx",
          line: 21,
          col: 0,
        },
        declarationKind: "export",
        functionDef: {
          params: [
            {
              kind: "object",
              props: [
                {
                  kind: "assign",
                  key: "title",
                  value: null,
                },
                {
                  kind: "assign",
                  key: "products",
                  value: null,
                },
              ],
              optional: false,
              tsType: {
                repr: "Props",
                kind: "typeRef",
                typeRef: {
                  typeParams: null,
                  typeName: "Props",
                },
              },
            },
          ],
          returnType: null,
          hasBody: true,
          isAsync: false,
          isGenerator: false,
          typeParams: [],
        },
      },
      {
        kind: "import",
        name: "ProductCard",
        location: {
          filename:
            "file:///Users/lucis/deco/fashion/components/ProductShelfD.tsx",
          line: 1,
          col: 0,
        },
        declarationKind: "private",
        importDef: {
          src: "file:///Users/lucis/deco/fashion/components/ProductCard.tsx",
          imported: "default",
        },
      },
      {
        kind: "import",
        name: "Product",
        location: {
          filename:
            "file:///Users/lucis/deco/fashion/components/ProductShelfD.tsx",
          line: 2,
          col: 0,
        },
        declarationKind: "private",
        importDef: {
          src: "file:///Users/lucis/deco/fashion/components/ProductCard.tsx",
          imported: "Product",
        },
      },
    ])
  )
);
