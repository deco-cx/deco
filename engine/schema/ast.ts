export type ASTNode =
  | InterfaceDefNode
  | TypeAliasDefNode
  | VariableDefNode
  | ImportDefNode
  | FunctionDefNode;

interface Node {
  name: string;
  location: FileLocation;
  declarationKind: "export" | "private";
  jsDoc?: JSDoc;
}

export interface InterfaceDefNode extends Node {
  kind: "interface";
  interfaceDef: InterfaceDef;
}

export interface TypeAliasDefNode extends Node {
  kind: "typeAlias";
  typeAliasDef: TypeAliasDef;
}

export interface FunctionDefNode extends Node {
  kind: "function";
  functionDef: FunctionDef;
}

export interface VariableDefNode extends Node {
  kind: "variable";
  variableDef: VariableDef;
}

export interface ImportDefNode extends Node {
  kind: "import";
  importDef: ImportDef;
}

export interface FunctionDefNode extends Node {
  kind: "function";
  functionDef: FunctionDef;
}

export interface TypeAliasDef {
  tsType: TsType;
  typeParams: TsType[];
}

export interface VariableDef {
  tsType: TsType;
  kind: TsType["kind"];
}

export interface FunctionDef {
  params: Param[];
  returnType: TsType;
  hasBody: boolean;
  isAsync: boolean;
  isGenerator: boolean;
  typeParams: unknown[];
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

export type TsType =
  | TsTypeFnOrConstructor
  | TsTypeTypeRef
  | TsTypeKeyword
  | TsTypeUnion
  | TsTypeIndexedAccess
  | TsTypeTypeLiteral
  | TsTypeArray
  | TsTypeLiteral;

export interface TsTypeLiteral {
  repr: string;
  kind: "literal";
  literal: Record<string, string | number | boolean> & {
    kind: "string" | "number" | "boolean";
  };
}

export interface TsTypeArray {
  repr: "";
  kind: "array";
  array: TsType;
}

export interface TsTypeTypeLiteral {
  repr: "";
  kind: "typeLiteral";
  typeLiteral: TypeLiteral;
}
export interface FnOrConstructor {
  constructor: boolean;
  tsType: TsType;
  params: Param[];
}

export interface TsTypeFnOrConstructor {
  repr: string;
  kind: "fnOrConstructor";
  fnOrConstructor: FnOrConstructor;
}
export interface TsTypeTypeRef {
  repr: string;
  kind: "typeRef";
  typeRef: TypeRef;
}

export interface TsTypeKeyword {
  repr: string;
  kind: "keyword";
  keyword: "string" | "unknown";
}

export interface TsTypeUnion {
  repr: "";
  kind: "union";
  union: TsType[];
}

export interface TsTypeIndexedAccess {
  repr: "";
  kind: "indexedAccess";
  indexedAccess: {
    readonly: boolean;
    objType: TsType;
    indexType: TsType;
  };
}

export interface TypeRef {
  typeParams: null | TsType[];
  typeName: string;
}

export interface ImportDef {
  src: string;
  imported: string;
}

export interface TypeDef {
  name: string;
  methods: unknown[];
  properties: Property[];
  callSignatures: unknown[];
  indexSignatures: unknown[];
}

export interface InterfaceDef extends TypeDef {
  extends: TsType[];
  typeParams: unknown[];
}

export type TypeLiteral = TypeDef;

export interface Property {
  name: string;
  location?: FileLocation;
  params: unknown[];
  computed: boolean;
  optional: boolean;
  tsType: TsType;
  typeParams: unknown[];
  jsDoc?: JSDoc;
}

export interface JSDoc {
  tags?: Tag[];
}

export interface Tag {
  kind: string;
  value: string;
}

export interface FileLocation {
  filename: string;
  line: number;
  col: number;
}
