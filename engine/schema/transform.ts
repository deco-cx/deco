import type {
  ArrayExpression,
  ArrowFunctionExpression,
  AssignmentPattern,
  ClassDeclaration,
  ClassExpression,
  ClassMethod,
  Constructor,
  ExportNamedDeclaration,
  Expression,
  Fn,
  FunctionDeclaration,
  FunctionExpression,
  Identifier,
  ModuleItem,
  NamedImportSpecifier,
  ObjectExpression,
  ObjectPattern,
  Param,
  Pattern,
  Statement,
  StringLiteral,
  TsArrayType,
  TsEntityName,
  TsIndexedAccessType,
  TsInterfaceDeclaration,
  TsIntersectionType,
  TsKeywordType,
  TsKeywordTypeKind,
  TsLiteral,
  TsLiteralType,
  TsOptionalType,
  TsParenthesizedType,
  TsTupleType,
  TsType,
  TsTypeAnnotation,
  TsTypeElement,
  TsTypeLiteral,
  TsTypeParameter,
  TsTypeParameterInstantiation,
  TsTypeReference,
  TsUnionType,
  VariableDeclarator,
} from "@deco/deno-ast-wasm/types";
import type {
  JSONSchema7,
  JSONSchema7Type,
  JSONSchema7TypeName,
} from "../../deps.ts";
import type { BlockModuleRef, IntrospectParams } from "../block.ts";
import {
  type ImportMapResolver,
  safeImportResolve,
} from "../importmap/builder.ts";
import { spannableToJSONSchema } from "./comments.ts";
import type { ParsedSource } from "./deps.ts";
import { parsePath } from "./parser.ts";
import { beautify, visit } from "./utils.ts";

export type ReferenceKey = string;
export interface SchemeableBase {
  jsDocSchema?: JSONSchema7;
  friendlyId?: string;
  id?: string; // generated on-demand
  name: string;
  file?: string;
  anchor?: string;
}
export interface InlineSchemeable extends SchemeableBase {
  type: "inline";
  value: JSONSchema7;
}
export interface ObjectSchemeable extends SchemeableBase {
  type: "object";
  extends?: Schemeable[];
  title?: string;
  default?: JSONSchema7Type;
  value: Record<
    string,
    {
      title?: string;
      schemeable: Schemeable;
      jsDocSchema?: JSONSchema7;
      required: boolean;
    }
  >;
}

export interface RecordSchemeable extends SchemeableBase {
  type: "record";
  value: Schemeable;
}

export interface UnionSchemeable extends SchemeableBase {
  type: "union";
  value: Schemeable[];
}

export interface IntersectionSchemeable extends SchemeableBase {
  type: "intersection";
  value: Schemeable[];
}
export interface ArraySchemeable extends SchemeableBase {
  type: "array";
  value: Schemeable | Schemeable[];
}

export interface UnknownSchemable extends SchemeableBase {
  type: "unknown";
}
export interface SchemeableAlias extends SchemeableBase {
  type: "alias";
  value: Schemeable;
}

export type Schemeable =
  | ObjectSchemeable
  | UnionSchemeable
  | IntersectionSchemeable
  | ArraySchemeable
  | InlineSchemeable
  | RecordSchemeable
  | UnknownSchemable
  | SchemeableAlias;

export interface SchemeableTransformContext {
  path: string;
  importMapResolver: ImportMapResolver;
  parsedSource: ParsedSource;
  references?: Map<
    ReferenceKey,
    Schemeable
  >;
  instantiatedTypeParams?: Schemeable[];
  tryGetFromInstantiatedParameters?: (
    name: string,
  ) => Promise<Schemeable | undefined>;
}

const UNKNOWN: UnknownSchemable = {
  name: "unknown",
  type: "unknown",
};

const tsTypeElementsToObjectSchemeable = async (
  tsTypeElements: TsTypeElement[],
  ctx: SchemeableTransformContext,
): Promise<Omit<ObjectSchemeable, "name">> => {
  const keysPromise: Promise<[string, ObjectSchemeable["value"][string]]>[] =
    [];
  for (const prop of tsTypeElements) {
    if (prop.type !== "TsPropertySignature") {
      continue;
    }
    if (!prop.typeAnnotation) {
      continue;
    }
    const key = prop.key;
    if (key.type !== "Identifier" && key.type !== "StringLiteral") {
      continue;
    }
    // ignore prop if it starts with "$"
    if (key.value.startsWith("$")) {
      continue;
    }
    const jsDocSchema = spannableToJSONSchema(prop);
    if ("ignore" in jsDocSchema) {
      continue;
    }
    keysPromise.push(
      tsTypeToSchemeable(prop.typeAnnotation.typeAnnotation, ctx, prop.optional)
        .then((
          schemeable,
        ) => [
          key.value,
          {
            title: beautify(key.value),
            jsDocSchema: prop.readonly
              ? { ...jsDocSchema ?? {}, readOnly: true }
              : jsDocSchema,
            schemeable,
            required: !prop.optional,
          } as ObjectSchemeable["value"][string],
        ]),
    );
  }
  const keys = await Promise.all(keysPromise);
  const schemeable: Omit<ObjectSchemeable, "name"> = {
    type: "object",
    value: {},
  };
  for (const [key, value] of keys) {
    schemeable.value[key] = value;
  }
  return schemeable;
};

const getFromParametersFunc = (
  params: TsTypeParameter[],
  ctx: SchemeableTransformContext,
): SchemeableTransformContext["tryGetFromInstantiatedParameters"] => {
  const {
    tryGetFromInstantiatedParameters: _tryGetFromInstantiatedParameters,
    instantiatedTypeParams,
  } = ctx;
  const typeParamNameToIdx: Record<string, { idx: number; default?: TsType }> =
    {};

  for (let paramIdx = 0; paramIdx < params.length; paramIdx++) {
    const param = params[paramIdx];
    typeParamNameToIdx[param.name.value] = {
      idx: paramIdx,
      default: param.default,
    };
  }
  return async (
    name: string,
  ): Promise<Schemeable | undefined> => {
    const val = typeParamNameToIdx[name];
    if (!val) {
      return undefined;
    }
    return instantiatedTypeParams?.[val.idx] ??
      await _tryGetFromInstantiatedParameters?.(name) ??
      (val.default
        ? tsTypeToSchemeable(val.default, {
          ...ctx,
          tryGetFromInstantiatedParameters: _tryGetFromInstantiatedParameters,
        })
        : undefined);
  };
};

const tsInterfaceDeclarationToSchemeable = async (
  dec: TsInterfaceDeclaration,
  ctx: SchemeableTransformContext,
): Promise<Schemeable> => {
  const {
    path,
    tryGetFromInstantiatedParameters: _tryGetFromInstantiatedParameters,
  } = ctx;
  const allOfs: Promise<Schemeable>[] = [];
  const params = dec.typeParams?.parameters ?? [];

  const tryGetFromInstantiatedParameters = getFromParametersFunc(params, ctx);
  for (const ext of dec.extends) {
    const expression = ext.expression;
    if (expression.type === "Identifier") {
      const newCtx = {
        ...ctx,
        tryGetFromInstantiatedParameters,
      };
      allOfs.push(
        wellKnownTypeReferenceToSchemeable({
          typeName: expression,
          typeParams: ext.typeArguments,
        }, ctx).then((schemeable) =>
          schemeable ?? typeNameToSchemeable(expression.value, newCtx)
        ),
      );
    }
  }
  const objectSchemeable = await tsTypeElementsToObjectSchemeable(
    dec.body.body,
    {
      ...ctx,
      tryGetFromInstantiatedParameters,
    },
  );
  return {
    ...objectSchemeable,
    file: path,
    name: dec.id.value,
    extends: await Promise.all(allOfs),
  };
};
// Advanced caching system with graph-based resolution
interface TypeResolutionNode {
  id: string;
  type: 'type' | 'import' | 'well-known';
  dependencies: Set<string>;
  resolved: boolean;
  result?: Promise<Schemeable>;
  timestamp: number;
}

class TypeResolutionGraph {
  private nodes = new Map<string, TypeResolutionNode>();
  private processing = new Set<string>();
  private cache = new Map<string, Promise<Schemeable>>();
  private fileCache = new Map<string, Promise<ParsedSource | undefined>>();
  private typeCache = new Map<string, Promise<Schemeable>>();
  
  constructor() {
    // Clear caches on HMR
    addEventListener("hmr", () => {
      this.nodes.clear();
      this.processing.clear();
      this.cache.clear();
      this.fileCache.clear();
      this.typeCache.clear();
    });
  }

  private createNodeId(type: string, path: string, context: string = ''): string {
    return `${type}:${path}:${context}`;
  }

  private async resolveNode(nodeId: string, resolver: () => Promise<Schemeable>): Promise<Schemeable> {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    // Check if already resolved
    if (node.resolved && node.result) {
      return node.result;
    }

    // Check if currently processing (circular dependency detection)
    if (this.processing.has(nodeId)) {
      console.warn(`Circular dependency detected for ${nodeId}`);
      return UNKNOWN;
    }

    // Check cache first
    const cached = this.cache.get(nodeId);
    if (cached) {
      node.resolved = true;
      node.result = cached;
      return cached;
    }

    // Mark as processing
    this.processing.add(nodeId);

    try {
      // Resolve dependencies first (topological order)
      const dependencyPromises = Array.from(node.dependencies).map(depId => {
        const depNode = this.nodes.get(depId);
        return depNode ? this.resolveNode(depId, () => Promise.resolve(UNKNOWN)) : Promise.resolve(UNKNOWN);
      });

      await Promise.all(dependencyPromises);

      // Now resolve this node
      const result = await resolver();

      // Cache the result
      this.cache.set(nodeId, Promise.resolve(result));
      node.resolved = true;
      node.result = Promise.resolve(result);
      node.timestamp = Date.now();

      return result;
    } finally {
      this.processing.delete(nodeId);
    }
  }

  async resolveType(typeName: string, ctx: SchemeableTransformContext): Promise<Schemeable> {
    const nodeId = this.createNodeId('type', ctx.path, typeName);
    
    // Check if node already exists
    let node = this.nodes.get(nodeId);
    if (!node) {
      node = {
        id: nodeId,
        type: 'type',
        dependencies: new Set(),
        resolved: false,
        timestamp: Date.now(),
      };
      this.nodes.set(nodeId, node);
    }

    return this.resolveNode(nodeId, async () => {
      return this.performTypeResolution(typeName, ctx, node!);
    });
  }

  async resolveFile(path: string, importMapResolver: ImportMapResolver): Promise<ParsedSource | undefined> {
    const nodeId = this.createNodeId('file', path);
    
    // Check file cache first
    const cached = this.fileCache.get(nodeId);
    if (cached) {
      return cached;
    }

    const filePromise = parsePath(path);
    this.fileCache.set(nodeId, filePromise);
    return filePromise;
  }

  private async performTypeResolution(
    typeName: string, 
    ctx: SchemeableTransformContext, 
    node: TypeResolutionNode
  ): Promise<Schemeable> {
    // Check instantiated parameters first
    const val = await ctx.tryGetFromInstantiatedParameters?.(typeName);
    if (val) {
      return val;
    }

    // Check type cache
    const cacheKey = `${ctx.path}:${typeName}:${ctx.parsedSource.program.body.length}`;
    const typeCached = this.typeCache.get(cacheKey);
    if (typeCached) {
      return typeCached;
    }

    // Perform the actual resolution
    const result = await this.resolveTypeInProgram(typeName, ctx, node);
    
    // Cache the result
    this.typeCache.set(cacheKey, Promise.resolve(result));
    
    return result;
  }

  private async resolveTypeInProgram(
    typeName: string, 
    ctx: SchemeableTransformContext, 
    node: TypeResolutionNode
  ): Promise<Schemeable> {
    const { program } = ctx.parsedSource;
    
    // Use optimized visitor pattern with early exit
    const visitor = this.createOptimizedVisitor(typeName, ctx, node);
    const result = await this.visitProgram(program, visitor);
    
    if (result) {
      return result;
    }
    
    return UNKNOWN;
  }

  private createOptimizedVisitor(
    typeName: string, 
    ctx: SchemeableTransformContext, 
    node: TypeResolutionNode
  ) {
    return {
      ExportNamedDeclaration: async (item: any) => {
        // Early exit if no source (local export)
        if (!item.source?.value) {
          return this.visitLocalExports(item, typeName, ctx);
        }
        
        // Handle re-exports with dependency tracking
        return this.visitReExports(item, typeName, ctx, node);
      },
      ExportDeclaration: async (item: any) => {
        return this.visitDirectExports(item, typeName, ctx);
      },
      ExportAllDeclaration: async (item: any) => {
        return this.visitExportAll(item, typeName, ctx, node);
      }
    };
  }

  private async visitLocalExports(item: any, typeName: string, ctx: SchemeableTransformContext): Promise<Schemeable | undefined> {
    // Fast path for local exports - no file I/O needed
    for (const spec of item.specifiers || []) {
      if ((spec.exported?.value ?? spec.orig.value) === typeName) {
        // Find the actual declaration in the current file
        return this.findLocalDeclaration(typeName, ctx);
      }
    }
    return undefined;
  }

  private async visitReExports(
    item: any, 
    typeName: string, 
    ctx: SchemeableTransformContext, 
    node: TypeResolutionNode
  ): Promise<Schemeable | undefined> {
    const source = item.source.value;
    
    // Add dependency to the graph
    const depNodeId = this.createNodeId('file', source);
    node.dependencies.add(depNodeId);
    
    // Resolve the imported file
    const from = await ctx.importMapResolver.resolve(source, ctx.path);
    if (!from) {
      return UNKNOWN;
    }
    
    const newProgram = await this.resolveFile(from, ctx.importMapResolver);
    if (!newProgram) {
      return UNKNOWN;
    }
    
    // Recursively resolve in the new context
    return this.resolveType(typeName, {
      ...ctx,
      path: from,
      parsedSource: newProgram,
    });
  }

  private async visitDirectExports(item: any, typeName: string, ctx: SchemeableTransformContext): Promise<Schemeable | undefined> {
    if (item.declaration?.id?.value === typeName) {
      if (item.declaration.type === "TsInterfaceDeclaration") {
        return {
          jsDocSchema: spannableToJSONSchema(item),
          ...await tsInterfaceDeclarationToSchemeable(item.declaration, ctx),
        };
      }
      if (item.declaration.type === "TsTypeAliasDeclaration") {
        const _tryGetFromInstantiatedParameters = getFromParametersFunc(
          item.declaration.typeParams?.parameters ?? [],
          ctx,
        );
        const jsDocSchema = spannableToJSONSchema(item);
        const value = await tsTypeToSchemeable(
          item.declaration.typeAnnotation,
          {
            ...ctx,
            tryGetFromInstantiatedParameters: _tryGetFromInstantiatedParameters,
          },
        );

        if ("mergeDeclarations" in jsDocSchema) {
          delete jsDocSchema["mergeDeclarations"];
          return {
            ...value,
            jsDocSchema: { ...value.jsDocSchema, ...jsDocSchema },
          };
        }
        return {
          type: "alias",
          jsDocSchema,
          value,
          file: ctx.path,
          name: typeName,
        };
      }
    }
    return undefined;
  }

  private async visitExportAll(
    item: any, 
    typeName: string, 
    ctx: SchemeableTransformContext, 
    node: TypeResolutionNode
  ): Promise<Schemeable | undefined> {
    const source = item.source.value;
    
    // Add dependency to the graph
    const depNodeId = this.createNodeId('file', source);
    node.dependencies.add(depNodeId);
    
    const from = await ctx.importMapResolver.resolve(source, ctx.path);
    if (!from) {
      return undefined;
    }
    
    const newProgram = await this.resolveFile(from, ctx.importMapResolver);
    if (!newProgram) {
      return UNKNOWN;
    }
    
    return this.resolveType(typeName, {
      ...ctx,
      path: from,
      parsedSource: newProgram,
    });
  }

  private async findLocalDeclaration(typeName: string, ctx: SchemeableTransformContext): Promise<Schemeable | undefined> {
    // Fast local search without file I/O
    const { program } = ctx.parsedSource;
    
    for (const decl of program.body) {
      if (decl.type === "ExportDeclaration" && 
          decl.declaration && 
          'id' in decl.declaration && 
          decl.declaration.id?.value === typeName) {
        return this.visitDirectExports(decl, typeName, ctx);
      }
    }
    
    return undefined;
  }

  private async visitProgram(program: any, visitor: any): Promise<Schemeable | undefined> {
    // Optimized visitor that stops on first match
    for (const item of program.body) {
      const handler = visitor[item.type];
      if (handler) {
        const result = await handler(item);
        if (result) {
          return result;
        }
      }
    }
    return undefined;
  }
}

// Global instance of the resolution graph
const typeResolutionGraph = new TypeResolutionGraph();

// Global cache for type name resolution to avoid repeated lookups
const typeNameCache = new Map<string, Promise<Schemeable>>();

// Clear type name cache on HMR
addEventListener("hmr", () => {
  typeNameCache.clear();
});

// Global cache for tsType resolution to avoid repeated processing
const tsTypeCache = new Map<string, Promise<Schemeable>>();

// Clear tsType cache on HMR
addEventListener("hmr", () => {
  tsTypeCache.clear();
});

export const typeNameToSchemeable = async (
  typeName: string,
  ctx: SchemeableTransformContext,
): Promise<Schemeable> => {
  // Use the new graph-based resolution system
  return typeResolutionGraph.resolveType(typeName, ctx);
};

const wellKnownTypeReferenceToSchemeable = async <
  TRef extends {
    typeName: TsEntityName;
    typeParams?: TsTypeParameterInstantiation;
  },
>(
  ref: TRef,
  ctx: SchemeableTransformContext,
): Promise<Schemeable | undefined> => {
  const typeName = ref.typeName;
  if (typeName.type !== "Identifier") {
    return undefined;
  }
  const name = typeName.value;

  const typeParams = ref.typeParams?.params ?? [];
  switch (name) {
    case "Record": {
      if (typeParams.length !== 2) {
        return UNKNOWN;
      }

      const secondParam = typeParams[1];

      const recordSchemeable = await tsTypeToSchemeable(
        secondParam,
        ctx,
      );

      return {
        type: "record",
        name: `record<${recordSchemeable.name}>`,
        value: recordSchemeable,
      };
    }
    case "PreactComponent": {
      if (typeParams.length < 1) {
        return UNKNOWN;
      }
      const typeRef = typeParams[0];

      const result = await tsTypeToSchemeable(
        typeRef,
        ctx,
      );
      
      return result;
    }
    case "Response": {
      return {
        type: "inline",
        name: "Handler",
        value: {
          $ref: "#/root/handlers",
        },
      };
    }
    case "Section": {
      if (typeParams.length === 0) {
        return undefined;
      }
      
      const result = await tsTypeToSchemeable(typeParams[0], ctx);
      
      return result;
    }
    case "InstanceOf": {
      if (typeParams.length < 2) {
        return undefined;
      }
      const configName = typeParams[1];
      if (configName.type !== "TsLiteralType") {
        return undefined;
      }
      const literal = (configName as TsLiteralType).literal;
      if (literal.type !== "StringLiteral") {
        return undefined;
      }
      const split = literal.value.split("/");
      return {
        file: ctx.path,
        type: "inline",
        name: split[split.length - 1],
        value: {
          $ref: literal.value,
        },
      };
    }
    case "BlockInstance": {
      if (typeParams.length < 1) {
        return undefined;
      }
      const configName = typeParams[0];
      if (configName.type !== "TsLiteralType") {
        return undefined;
      }
      const literal = (configName as TsLiteralType).literal;
      if (literal.type !== "StringLiteral") {
        return undefined;
      }
      return {
        type: "inline",
        name: `BI@${btoa(literal.value)}`,
        value: {
          $ref: `#/definitions/${btoa(literal.value)}`,
        },
      };
    }
    case "Resolvable": {
      if (typeParams.length < 1) {
        return {
          type: "inline",
          name: "Resolvable",
          value: {
            $ref: "#/definitions/Resolvable",
          },
        };
      }
      const typeRef = typeParams[0];

      const result = await tsTypeToSchemeable(
        typeRef,
        ctx,
      );
      
      return result;
    }
    case "Partial": {
      if (typeParams.length < 1) {
        return UNKNOWN;
      }
      const schemeable = await tsTypeToSchemeable(
        typeParams[0],
        ctx,
      );
      if (schemeable.type !== "object") { // TODO(mcandeia) support arrays, unions and intersections
        return UNKNOWN;
      }

      const newProperties: ObjectSchemeable["value"] = {};
      for (const [key, value] of Object.entries(schemeable.value)) {
        newProperties[key] = { ...value, required: false };
      }
      return {
        ...schemeable,
        name: `Partial@${schemeable.name}`,
        value: newProperties,
      };
    }
    case "Omit": {
      if (
        typeParams.length < 2
      ) {
        return UNKNOWN;
      }
      const schemeable = await tsTypeToSchemeable(
        typeParams[0],
        ctx,
      );
      const keys: string[] = [];
      if (schemeable.type === "object") { // TODO(mcandeia) support arrays, unions and intersections
        const omitKeys = typeParams[1] as TsUnionType;
        if (omitKeys?.types) {
          for (const value of omitKeys?.types) {
            if (
              value.type === "TsLiteralType" &&
              (value as TsLiteralType).literal.type === "StringLiteral"
            ) {
              const val =
                ((value as TsLiteralType).literal as StringLiteral).value;
              delete (schemeable
                .value[
                  val
                ]);
              keys.push(val);
            }
          }
        }
        const omitKeysAsLiteral = typeParams[1] as TsLiteralType;
        if (
          omitKeysAsLiteral?.type === "TsLiteralType" &&
          (omitKeysAsLiteral?.literal as TsLiteral)?.type === "StringLiteral"
        ) {
          const val =
            ((omitKeysAsLiteral as TsLiteralType).literal as StringLiteral)
              .value;
          delete (schemeable.value[val]);
          keys.push(val);
        }
      }
      keys.sort();
      return {
        ...schemeable,
        name: schemeable.name && keys.length > 0
          ? `omit${btoa(keys.join())}${schemeable.name}`
          : schemeable.name!,
      };
    }
    case "Pick": {
      if (
        typeParams.length < 2
      ) {
        return UNKNOWN;
      }
      const schemeable = await tsTypeToSchemeable(
        typeParams[0],
        ctx,
      );
      const keys: string[] = [];
      if (schemeable.type === "object") { // TODO(mcandeia) support arrays, unions and intersections
        const newValue: typeof schemeable["value"] = {};
        const pickKeys = typeParams[1] as TsUnionType;
        if (pickKeys?.types) {
          for (const value of pickKeys?.types) {
            if (
              value.type === "TsLiteralType" &&
              (value as TsLiteralType).literal.type === "StringLiteral"
            ) {
              const val =
                ((value as TsLiteralType).literal as StringLiteral).value;
              newValue[val] = schemeable.value[val];
              keys.push(val);
            }
          }
        }
        const pickKeysAsLiteral = typeParams[1] as TsLiteralType;
        if (
          pickKeysAsLiteral?.type === "TsLiteralType" &&
          (pickKeysAsLiteral?.literal as TsLiteral)?.type === "StringLiteral"
        ) {
          const val =
            ((pickKeysAsLiteral as TsLiteralType).literal as StringLiteral)
              .value;
          newValue[val] = schemeable.value[val];
          keys.push(val);
        }
      }
      keys.sort();
      return {
        ...schemeable,
        name: `pick${btoa(keys.join())}${schemeable.name}`,
      };
    }
    case "Array": {
      if (typeParams.length < 1) {
        return {
          name: "[unknown]",
          type: "array",
          value: UNKNOWN,
        };
      }
      const typeSchemeable = await tsTypeToSchemeable(
        typeParams[0],
        ctx,
      );

      return {
        type: "array",
        name: `[${typeSchemeable.name}]`,
        file: typeSchemeable.file,
        value: typeSchemeable,
      };
    }
    case "Promise": {
      if (typeParams.length < 1) {
        return UNKNOWN;
      }
      return tsTypeToSchemeable(
        typeParams[0],
        ctx,
      );
    }
    case "LoaderReturnType": {
      if (typeParams.length < 1) {
        return UNKNOWN;
      }
      return tsTypeToSchemeable(
        typeParams[0],
        ctx,
      );
    }
  }
};
// cannot have typeParams but can have type parameters on context
export const tsTypeToSchemeable = async (
  tsType: TsType,
  ctx: SchemeableTransformContext,
  optional = false,
): Promise<Schemeable> => {
  const {
    path,
    references,
  } = ctx;

  // Create a global cache key
  const globalCacheKey = `${path}:${tsType.type}:${tsType.span.start}-${tsType.span.end}:${optional}:${
    ctx.instantiatedTypeParams?.map?.((param) => param.name)?.sort?.()?.join("") ?? ""
  }`;
  
  // Check global cache first
  const globalCached = tsTypeCache.get(globalCacheKey);
  if (globalCached) {
    return globalCached;
  }

  const refKey = `${ctx.path}+${tsType.span.start}${tsType.span.end}+${
    ctx.instantiatedTypeParams?.map?.((param) => param.name)?.sort?.()?.join(
      "",
    ) ?? ""
  }`;
  const schemeable = references?.get?.(refKey);

  if (schemeable !== undefined) {
    return schemeable;
  }
  const ref = { type: "unknown", name: "unknown" } as Schemeable;
  references?.set?.(refKey, ref);
  const resolve = async (): Promise<Schemeable> => {
    switch (tsType.type) {
      case "TsLiteralType": {
        const type = tsType as TsLiteralType;
        if (type.literal.type === "TemplateLiteral") {
          return UNKNOWN;
        }
        const literalToJsonSchemaType: Record<string, JSONSchema7TypeName> = {
          "StringLiteral": "string",
          "NumericLiteral": "number",
          "BooleanLiteral": "boolean",
        };
        const value = type.literal.value;
        const constVal = typeof value === "bigint"
          ? value as unknown as number
          : value;
        return {
          type: "inline",
          name: `${constVal}`.replaceAll("/", "_"),
          value: {
            type: optional
              ? [literalToJsonSchemaType[type.literal.type], "null"]
              : literalToJsonSchemaType[type.literal.type], // FIXME(mcandeia) not compliant with JSONSchema
            const: constVal,
            default: constVal,
          },
        };
      }
      case "TsIndexedAccessType": {
        const type = tsType as TsIndexedAccessType;
        const _indexType = type.indexType;
        if (_indexType.type !== "TsLiteralType") {
          return UNKNOWN;
        }
        const indexType = (_indexType as TsLiteralType).literal;
        const schemeable = await tsTypeToSchemeable(type.objectType, ctx);
        if (
          schemeable.type === "object" && indexType.type === "StringLiteral"
        ) {
          const { [indexType.value]: prop } = schemeable.value;
          return {
            ...schemeable,
            name: `${schemeable.name}idx${indexType.value}`,
            file: path,
            value: {
              [indexType.value]: prop,
            },
          };
        }
        if (
          schemeable.type === "array" && indexType.type === "NumericLiteral"
        ) {
          const itemSchemeable = Array.isArray(schemeable.value)
            ? schemeable.value[indexType.value]
            : schemeable.value;
          return {
            ...itemSchemeable,
            file: path,
            name: `${schemeable.name}idx${indexType.value}`,
          };
        }
        return UNKNOWN;
      }
      case "TsParenthesizedType": {
        const type = tsType as TsParenthesizedType;
        return tsTypeToSchemeable(type.typeAnnotation, ctx);
      }
      case "TsIntersectionType": {
        const type = tsType as TsIntersectionType;
        const value = await Promise.all(
          type.types.map((tp) => tsTypeToSchemeable(tp, ctx)),
        );
        const files = value.map((f) => f.file).filter(Boolean).join("-");
        const filePath = files.length === 0 ? undefined : files;
        return {
          file: filePath,
          name: value.map((v) => v.name).join("&"),
          type: "intersection",
          value,
        };
      }
      case "TsUnionType": {
        const type = tsType as TsUnionType;
        const value = await Promise.all(
          type.types.map((tp) => tsTypeToSchemeable(tp, ctx)),
        );
        const files = value.map((f) => f.file).filter(Boolean).join("-");
        const filePath = files.length === 0 ? undefined : files;
        return {
          file: filePath,
          type: "union",
          name: value.map((v) => v.name).join("|"),
          value,
        };
      }
      case "TsOptionalType": {
        const type = tsType as TsOptionalType;
        const genType = await tsTypeToSchemeable(type.typeAnnotation, ctx);
        return {
          file: genType.file,
          type: "union",
          name: `union@null|${genType.name}`,
          value: [
            {
              name: "null",
              type: "inline",
              value: {
                type: "null",
              },
            },
            genType,
          ],
        };
      }
      case "TsTupleType": {
        const type = tsType as TsTupleType;
        const value = await Promise.all(
          type.elemTypes.map((tp) => tsTypeToSchemeable(tp.ty, ctx)),
        );
        const files = value.map((f) => f.file).filter(Boolean).join("-");
        const filePath = files.length === 0 ? undefined : files;
        return {
          type: "array",
          name: `tp@${value.map((v) => v.name).join("|")}`,
          value,
          file: filePath,
        };
      }
      case "TsArrayType": {
        const type = tsType as TsArrayType;
        const value = await tsTypeToSchemeable(type.elemType, ctx);
        return {
          file: value.file,
          type: "array",
          name: `[${value.name}]`,
          value,
        };
      }
      case "TsTypeLiteral": {
        const type = tsType as TsTypeLiteral;
        return {
          file: path,
          name: `tl@${tsType.span.start}-${tsType.span.end}`,
          ...await tsTypeElementsToObjectSchemeable(type.members, ctx),
        };
      }
      case "TsKeywordType": {
        const type = tsType as TsKeywordType;
        const keywordToType: Record<TsKeywordTypeKind, JSONSchema7Type> = {
          undefined: "null",
          any: "object",
          never: "object",
          unknown: "object",
          void: "object",
          bigint: "number",
          boolean: "boolean",
          intrinsic: "object",
          null: "null",
          number: "number",
          object: "object",
          string: "string",
          symbol: "string",
        };

        const jsonSchemaType = keywordToType[type.kind] ?? type.kind;
        return {
          type: "inline",
          name: `${jsonSchemaType}`,
          value: type
            ? ({
              type: optional && jsonSchemaType !== "null"
                ? [jsonSchemaType, "null"]
                : jsonSchemaType,
            } as JSONSchema7)
            : {},
        };
      }
      case "TsTypeReference": {
        const type = tsType as TsTypeReference;
        if (type.typeName.type !== "Identifier") {
          return UNKNOWN;
        }
        const wellKnownType = await wellKnownTypeReferenceToSchemeable(
          type,
          ctx,
        );

        if (wellKnownType) {
          return wellKnownType;
        }
        const typeName = type.typeName.value;
        const parameters = type.typeParams?.params ?? [];
        const typeParams = await Promise.all(parameters.map((param) => {
          return tsTypeToSchemeable(param, ctx);
        }));

        const schemeable = await typeNameToSchemeable(typeName, {
          ...ctx,
          instantiatedTypeParams: typeParams,
        });

        return {
          ...schemeable,
          name: `${schemeable.name}${
            typeParams.length > 0
              ? `+${typeParams.map((p) => p.name).join("+")}`
              : ""
          }`,
        };
      }
      default:
        return UNKNOWN;
    }
  };

  const resolved: Schemeable = await resolve();
  Object.assign(ref, resolved);
  references?.delete?.(refKey);
  
  // Cache the result for future lookups
  tsTypeCache.set(globalCacheKey, Promise.resolve(resolved));
  
  return resolved;
};

export interface CanonicalDeclarationBase {
  path: string;
  parsedSource: ParsedSource;
  jsDoc: JSONSchema7;
}
export interface FunctionCanonicalDeclaration extends CanonicalDeclarationBase {
  exp: FunctionExpression | FunctionDeclaration | Fn | Constructor;
}

export interface VariableCanonicalDeclaration extends CanonicalDeclarationBase {
  exp?: ArrowFunctionExpression | ObjectExpression;
  declarator: VariableDeclarator;
}

export type CanonicalDeclaration =
  | VariableCanonicalDeclaration
  | FunctionCanonicalDeclaration;

const findFuncFromExportNamedDeclaration = async (
  importMapResolver: ImportMapResolver,
  funcName: string,
  item: ExportNamedDeclaration,
  path: string,
  parsedSource: ParsedSource,
): Promise<CanonicalDeclaration | undefined> => {
  const [funcNameOrClass, noneOrMethod] = funcName.split(".");
  for (const spec of item.specifiers) {
    if (
      spec.type === "ExportSpecifier" &&
      (spec.exported?.value ?? spec.orig.value) === funcNameOrClass
    ) {
      let source = item.source?.value;
      if (!source) {
        for (const decl of parsedSource.program.body) {
          if (decl.type === "ImportDeclaration") {
            for (const spec of decl.specifiers) {
              if (spec.local.value === funcName) {
                source = decl.source.value;
              }
            }
          }
        }
      }

      if (!source) {
        return undefined;
      }
      const url = await importMapResolver.resolve(source, path);
      if (!url) {
        return undefined;
      }
      const isFromDefault = spec.orig.value === "default";
      const newProgram = await parsePath(url);
      if (!newProgram) {
        return undefined;
      }
      if (isFromDefault && !noneOrMethod) {
        return findDefaultFuncExport(importMapResolver, url, newProgram);
      } else {
        return findFuncExport(
          importMapResolver,
          noneOrMethod ? `${spec.orig.value}.${noneOrMethod}` : spec.orig.value,
          url,
          newProgram,
        );
      }
    }
  }
  return undefined;
};

const classOf = (
  item: ModuleItem | Statement,
  className: string,
): [ClassDeclaration, boolean] | undefined => {
  // Check direct class declarations
  if (
    item.type === "ClassDeclaration" &&
    item.identifier.value === className
  ) {
    return [item, false];
  }

  // Check exported class declarations
  if (
    item.type === "ExportDeclaration" &&
    item.declaration.type === "ClassDeclaration" &&
    item.declaration.identifier.value === className
  ) {
    return [item.declaration, true];
  }
};

const findClassMethod = (
  decl: ClassDeclaration | ClassExpression,
  methodName: string,
): ClassMethod | (Constructor & { function: Constructor }) | undefined => {
  for (const member of decl.body) {
    if (
      member.type === "Constructor" &&
      member.key.type === "Identifier" &&
      member.key.value === methodName
    ) {
      return { ...member, function: member }; // Consider class methods as always exported
    }
    if (
      member.type === "ClassMethod" &&
      member.key.type === "Identifier" &&
      member.key.value === methodName
    ) {
      return member;
    }
  }
};
const findMethod = async (
  importMapResolver: ImportMapResolver,
  path: string,
  parsedSource: ParsedSource,
  decl: ClassDeclaration | ClassExpression,
  methodName: string,
): Promise<
  CanonicalDeclaration | undefined
> => {
  const method = findClassMethod(decl, methodName);
  if (method) {
    return {
      path,
      parsedSource,
      exp: method.function,
      jsDoc: spannableToJSONSchema(method),
    };
  }
  if (decl.superClass && decl.superClass.type === "Identifier") {
    const superClassName = (decl.superClass as Identifier).value;
    const fn = await findFunc(
      importMapResolver,
      `${superClassName}.${methodName}`,
      path,
      parsedSource,
    );
    if (fn) {
      return fn[0];
    }
  }
  return undefined;
};
const findFunc = async (
  importMapResolver: ImportMapResolver,
  funcName: string,
  path: string,
  parsedSource: ParsedSource,
): Promise<[CanonicalDeclaration, boolean] | undefined> => {
  // Check if the function name contains a class reference
  const parts = funcName.split(".");
  if (parts.length === 2) {
    const [className, methodName] = parts;
    // Look for class declarations
    for (const item of parsedSource.program.body) {
      if (item.type === "ExportDefaultExpression") {
        if (
          item.expression.type === "Identifier" &&
          className === "default"
        ) {
          return await findFunc(
            importMapResolver,
            `${item.expression.value}.${methodName}`,
            path,
            parsedSource,
          );
        }
      }
      if (item.type === "ExportDefaultDeclaration") {
        if (item.decl.type === "ClassExpression") {
          const clssName = item.decl.identifier?.value;
          if (!clssName) { // when default export is what matters.
            continue;
          }
          const method = await findMethod(
            importMapResolver,
            path,
            parsedSource,
            item.decl,
            methodName,
          );
          if (method) {
            return [method, true]; // Consider class methods as always exported
          }
        }
      }
      // Check class declarations
      if (
        item.type === "ClassDeclaration" &&
        item.identifier.value === className
      ) {
        const method = await findMethod(
          importMapResolver,
          path,
          parsedSource,
          item,
          methodName,
        );
        if (method) {
          return [method, true]; // Consider class methods as always exported
        }
      }

      // Check exported class declarations
      if (
        item.type === "ExportDeclaration" &&
        item.declaration.type === "ClassDeclaration" &&
        item.declaration.identifier.value === className
      ) {
        const method = await findMethod(
          importMapResolver,
          path,
          parsedSource,
          item.declaration,
          methodName,
        );
        if (method) {
          return [method, true]; // Consider class methods as always exported
        }
      }
    }
  }

  // Original function finding logic for non-class methods
  for (const item of parsedSource.program.body) {
    const clss = classOf(item, funcName);
    if (clss) {
      const method = findClassMethod(clss[0], "constructor");
      if (method) {
        return [{
          path,
          parsedSource,
          exp: method.function,
          jsDoc: spannableToJSONSchema(method),
        }, clss[1]];
      }
    }
    if (item.type === "ExportNamedDeclaration") {
      const found = await findFuncFromExportNamedDeclaration(
        importMapResolver,
        funcName,
        item,
        path,
        parsedSource,
      );
      if (found) {
        return [found, true];
      }
    }

    if (
      item.type === "FunctionDeclaration" &&
      item.identifier.value === funcName
    ) {
      return [{
        path,
        parsedSource,
        exp: item,
        jsDoc: spannableToJSONSchema(item),
      }, false];
    }

    if (
      item.type === "VariableDeclaration"
    ) {
      for (const decl of item.declarations) {
        if (
          decl.id.type === "Identifier" && decl.id.value === funcName
        ) {
          return [{
            declarator: decl,
            path,
            parsedSource,
            exp: decl.init && decl.init.type === "ArrowFunctionExpression"
              ? decl.init
              : undefined,
            jsDoc: spannableToJSONSchema(item),
          }, false];
        }
      }
    }

    if (
      item.type === "ExportDeclaration" &&
      item.declaration.type === "FunctionDeclaration" &&
      item.declaration.identifier.value === funcName
    ) {
      return [{
        path,
        parsedSource,
        exp: item.declaration,
        jsDoc: spannableToJSONSchema(item),
      }, true];
    }

    if (
      item.type === "ExportDeclaration" &&
      item.declaration.type === "VariableDeclaration"
    ) {
      for (const decl of item.declaration.declarations) {
        if (
          decl.id.type === "Identifier" && decl.id.value === funcName &&
          decl.init &&
          (decl.init.type === "ArrowFunctionExpression" ||
            decl.init.type === "ObjectExpression")
        ) {
          return [{
            declarator: decl,
            path,
            parsedSource,
            exp: decl.init,
            jsDoc: spannableToJSONSchema(item),
          }, true];
        }
      }
    }
  }
};
const findFuncExport = async (
  importMapResolver: ImportMapResolver,
  funcName: string,
  path: string,
  program: ParsedSource,
): Promise<CanonicalDeclaration | undefined> => {
  const func = await findFunc(importMapResolver, funcName, path, program);
  if (!func) {
    return undefined;
  }
  return func[1] ? func[0] : undefined;
};

export const findDefaultFuncExport = async (
  importMapResolver: ImportMapResolver,
  path: string,
  parsedSource: ParsedSource,
): Promise<CanonicalDeclaration | undefined> => {
  for (const item of parsedSource.program.body) {
    if (
      item.type === "ExportDefaultExpression" &&
      item.expression.type === "Identifier"
    ) {
      const func = await findFunc(
        importMapResolver,
        item.expression.value,
        path,
        parsedSource,
      );
      return func?.[0];
    }

    if (
      item.type === "ExportDefaultDeclaration" &&
      item.decl.type === "ClassExpression"
    ) {
      const clssName = item.decl.identifier?.value;
      if (!clssName) { // when default export is what matters.
        continue;
      }
      for (const member of item.decl.body) {
        if (
          member.type === "Constructor" &&
          member.key.type === "Identifier"
        ) {
          return {
            path,
            parsedSource,
            exp: member,
            jsDoc: spannableToJSONSchema(member),
          };
        }
      }
    }
    if (
      item.type === "ExportDefaultDeclaration" &&
      item.decl.type === "FunctionExpression"
    ) {
      return {
        exp: item.decl,
        path,
        parsedSource,
        jsDoc: spannableToJSONSchema(item),
      };
    }
    if (item.type === "ExportNamedDeclaration") {
      const found = await findFuncFromExportNamedDeclaration(
        importMapResolver,
        "default",
        item,
        path,
        parsedSource,
      );
      if (found) {
        return found;
      }
    }
  }
  return undefined;
};
const isVariableDeclaration = (
  canonical: CanonicalDeclaration,
): canonical is VariableCanonicalDeclaration => {
  return (canonical as VariableCanonicalDeclaration)?.declarator !== undefined;
};

// from legacy functions
const getWellKnownLoaderType = (
  declarator: VariableDeclarator,
): [TsType, TsType] | undefined => {
  const typeAnnotation = (declarator.id as { typeAnnotation: TsTypeAnnotation })
    ?.typeAnnotation;

  if (
    typeAnnotation &&
    typeAnnotation.typeAnnotation.type === "TsTypeReference" &&
    typeAnnotation.typeAnnotation.typeName.type === "Identifier" &&
    (typeAnnotation.typeAnnotation.typeName.value === "LoaderFunction" ||
      typeAnnotation.typeAnnotation.typeName.value === "PropsLoader") &&
    typeAnnotation.typeAnnotation.typeParams &&
    typeAnnotation.typeAnnotation.typeParams.params.length >= 2
  ) {
    return [
      typeAnnotation.typeAnnotation.typeParams.params[0],
      typeAnnotation.typeAnnotation.typeParams.params[1],
    ];
  }
  return undefined;
};
const returnOf = (canonical: CanonicalDeclaration): TsType | undefined => {
  if (isVariableDeclaration(canonical)) {
    const loader = getWellKnownLoaderType(canonical.declarator);
    if (loader) {
      return loader[1];
    }
  }
  const exp = canonical?.exp;
  if (!exp || !("returnType" in exp)) {
    return undefined;
  }
  return exp?.returnType?.typeAnnotation;
};

export interface TsTypeWithDefaults {
  default?: JSONSchema7Type;
  type?: TsType;
}
/**
 * Generates a javascript object based on the AST expressions.
 */
function generateObject(
  obj: ObjectExpression | ArrayExpression | Expression,
): JSONSchema7Type {
  if (obj.type === "ObjectExpression") {
    const result: JSONSchema7Type = {};
    for (const prop of obj.properties) {
      if (prop.type !== "KeyValueProperty") {
        continue;
      }
      if (prop.key.type !== "Identifier") {
        continue;
      }
      result[prop.key.value] = generateObject(prop.value)!;
    }
    return result;
  } else if (obj.type === "ArrayExpression") {
    return obj.elements.map((element) =>
      element ? generateObject(element.expression) : null
    );
  } else if (obj.type === "StringLiteral" || obj.type === "NumericLiteral") {
    return obj.value;
  }
  return null;
}
const paramsOf = (
  canonical: CanonicalDeclaration,
): TsTypeWithDefaults[] | undefined => {
  if (isVariableDeclaration(canonical)) {
    const loader = getWellKnownLoaderType(canonical.declarator);
    if (loader) {
      return [{ type: loader[0] }];
    }
  }
  const exp = canonical?.exp;
  if (!exp || !("params" in exp)) {
    return undefined;
  }

  return exp.params?.map((param) => {
    if (param.type === "Parameter") {
      if ((param as Param).pat.type === "AssignmentPattern") {
        if ((param.pat as AssignmentPattern).left.type === "ObjectPattern") {
          const tp = ((param.pat as AssignmentPattern).left as ObjectPattern)
            .typeAnnotation
            ?.typeAnnotation!;
          return {
            type: tp,
            default: generateObject((param.pat as AssignmentPattern).right),
          };
        }
      }
    }
    const pat = (param as Param)?.pat ?? param as Pattern;
    const typeAnnotation = (pat as { typeAnnotation?: TsTypeAnnotation })
      ?.typeAnnotation?.typeAnnotation;
    return { type: typeAnnotation };
  });
};

const getReturnFnFunction = async (
  funcNames: string[],
  importMapResolver: ImportMapResolver,
  mPath: string,
  mProgram: ParsedSource,
) => {
  for (const name of funcNames) {
    const fn = name === "default"
      ? await findDefaultFuncExport(importMapResolver, mPath, mProgram)
      : await findFuncExport(importMapResolver, name, mPath, mProgram);

    if (fn) return returnOf(fn);
  }
};

export const programToBlockRef = async (
  importMapResolver: ImportMapResolver,
  mPath: string,
  blockKey: string,
  mProgram: ParsedSource,
  schemeableReferences?: Map<
    ReferenceKey,
    Schemeable
  >,
  introspect?: IntrospectParams,
): Promise<BlockModuleRef | undefined> => {
  const funcNames = introspect?.funcNames ?? ["default"];

  for (const name of funcNames) {
    const fn = name === "default"
      ? await findDefaultFuncExport(importMapResolver, mPath, mProgram)
      : await findFuncExport(importMapResolver, name, mPath, mProgram);
    if (!fn) {
      continue;
    }

    const includeReturn = introspect?.includeReturn;
    const fnReturn = Array.isArray(includeReturn)
      ? await getReturnFnFunction(
        includeReturn,
        importMapResolver,
        mPath,
        mProgram,
      )
      : returnOf(fn);
    const { path, parsedSource } = fn;

    const retn = typeof includeReturn === "function"
      ? fnReturn ? includeReturn(fnReturn) : undefined
      : fnReturn;

    const baseBlockRef = {
      functionJSDoc: fn.jsDoc, //func.jsDoc && jsDocToSchema(func.jsDoc),
      functionRef: blockKey,
      outputSchema: includeReturn && retn
        ? await tsTypeToSchemeable(retn, {
          importMapResolver,
          path,
          parsedSource,
          references: schemeableReferences,
        })
        : undefined,
    };
    const params = paramsOf(fn);
    const paramIdx = 0;
    if (!params || params.length === 0) {
      return baseBlockRef;
    }
    const param = params[paramIdx];
    if (!param) {
      return baseBlockRef;
    }
    const [type, defaultValue] = [param.type, param.default];
    if (!type) {
      return baseBlockRef;
    }
    const inputSchema = await tsTypeToSchemeable(type, {
      importMapResolver,
      path,
      parsedSource,
      references: schemeableReferences,
    });
    if (inputSchema.type === "object") {
      inputSchema.default = defaultValue;
    }
    return {
      ...baseBlockRef,
      inputSchema,
    };
  }
  return undefined;
};
