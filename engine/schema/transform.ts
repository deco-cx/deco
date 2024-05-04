import type {
  ArrowFunctionExpression,
  ExportNamedDeclaration,
  FunctionDeclaration,
  FunctionExpression,
  NamedExportSpecifier,
  NamedImportSpecifier,
  ObjectExpression,
  Param,
  Pattern,
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
} from "https://esm.sh/v130/@swc/wasm@1.3.76";
import { JSONSchema7TypeName } from "https://esm.sh/v130/@types/json-schema@7.0.11/index.d.ts";
import { JSONSchema7, JSONSchema7Type } from "../../deps.ts";
import { BlockModuleRef, IntrospectParams } from "../block.ts";
import { beautify } from "./utils.ts";
import { ImportMapResolver } from "../importmap/builder.ts";
import { spannableToJSONSchema } from "./comments.ts";
import type { ParsedSource } from "./deps.ts";
import { parsePath } from "./parser.ts";

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
// cannot have typeParams but can have type parameters on context
export const typeNameToSchemeable = async (
  typeName: string,
  ctx: SchemeableTransformContext,
): Promise<Schemeable> => {
  const {
    path,
    parsedSource,
    tryGetFromInstantiatedParameters,
  } = ctx;
  const { program } = parsedSource;
  const val = await tryGetFromInstantiatedParameters?.(typeName);
  if (val) {
    return val;
  }
  // imports should be considered as a last resort since type name and func names can be equal, causing ambiguity
  let fromImport: (() => Promise<Schemeable>) | undefined;
  for (const item of program.body) {
    if (item.type === "ExportNamedDeclaration") {
      const spec = item.specifiers.find((
        spec,
      ) =>
        spec.type === "ExportSpecifier" &&
        (spec.exported?.value ?? spec.orig.value) === typeName
      );
      if (spec) {
        const _spec = spec as NamedExportSpecifier;
        const source = (item as ExportNamedDeclaration).source?.value;
        if (!source) {
          return UNKNOWN;
        }

        const from = ctx.importMapResolver.resolve(source, path);
        if (!from) {
          return UNKNOWN;
        }
        const newProgram = await parsePath(from);
        if (!newProgram) {
          return UNKNOWN;
        }

        return typeNameToSchemeable(
          _spec.exported?.value ?? _spec.orig.value,
          {
            ...ctx,
            path: from,
            parsedSource: newProgram,
          },
        );
      }
    }
    if (
      item.type === "ExportDeclaration" &&
      item.declaration.type === "TsInterfaceDeclaration" &&
      item.declaration.id.value === typeName
    ) {
      return {
        jsDocSchema: spannableToJSONSchema(item),
        ...await tsInterfaceDeclarationToSchemeable(item.declaration, ctx),
      };
    }
    if (item.type === "ExportAllDeclaration") {
      const from = ctx.importMapResolver.resolve(item.source.value, path);
      if (!from) {
        return UNKNOWN;
      }
      const newProgram = await parsePath(
        from,
      );
      if (!newProgram) {
        return UNKNOWN;
      }
      const type = await typeNameToSchemeable(
        typeName,
        {
          ...ctx,
          path: from,
          parsedSource: newProgram,
        },
      );
      if (type !== UNKNOWN) {
        return type;
      }
    }
    if (
      item.type === "ExportDeclaration" &&
      item.declaration.type === "TsTypeAliasDeclaration" &&
      item.declaration.id.value === typeName
    ) {
      const _tryGetFromInstantiatedParameters = getFromParametersFunc(
        item.declaration.typeParams?.parameters ?? [],
        ctx,
      );
      const jsDocSchema = spannableToJSONSchema(item);
      const value = await tsTypeToSchemeable(item.declaration.typeAnnotation, {
        ...ctx,
        tryGetFromInstantiatedParameters: _tryGetFromInstantiatedParameters,
      });

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
        file: path,
        name: typeName,
      };
    }
    if (
      item.type === "TsInterfaceDeclaration" &&
      item.id.value === typeName
    ) {
      return {
        jsDocSchema: spannableToJSONSchema(item),
        ...await tsInterfaceDeclarationToSchemeable(item, ctx),
      };
    }
    if (
      item.type === "TsTypeAliasDeclaration" &&
      item.id.value === typeName
    ) {
      const _tryGetFromInstantiatedParameters = getFromParametersFunc(
        item.typeParams?.parameters ?? [],
        ctx,
      );
      return {
        type: "alias",
        jsDocSchema: spannableToJSONSchema(item),
        value: await tsTypeToSchemeable(item.typeAnnotation, {
          ...ctx,
          tryGetFromInstantiatedParameters: _tryGetFromInstantiatedParameters,
        }),
        file: path,
        name: typeName,
      };
    }
    if (
      item.type === "ImportDeclaration"
    ) {
      const spec = item.specifiers.find((spec) =>
        spec.local.value === typeName && spec.type !== "ImportDefaultSpecifier"
      );
      if (spec) {
        fromImport = async () => {
          try {
            const from = ctx.importMapResolver.resolve(item.source.value, path);
            if (!from) {
              return UNKNOWN;
            }
            const newProgram = await parsePath(
              from,
            );
            if (!newProgram) {
              return UNKNOWN;
            }
            return typeNameToSchemeable(
              (spec as NamedImportSpecifier)?.imported?.value ??
                spec.local.value,
              {
                ...ctx,
                path: from,
                parsedSource: newProgram,
              },
            );
          } catch (err) {
            console.log(
              err,
              item.source.value,
              path,
              import.meta.resolve(path),
            );
            throw err;
          }
        };
        if (item.typeOnly) {
          return fromImport();
        }
      }
    }
  }
  return fromImport?.() ?? UNKNOWN;
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

      return tsTypeToSchemeable(
        typeRef,
        ctx,
      );
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
      return tsTypeToSchemeable(typeParams[0], ctx);
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
      const splitted = literal.value.split("/");
      return {
        file: ctx.path,
        type: "inline",
        name: splitted[splitted.length - 1],
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

      return tsTypeToSchemeable(
        typeRef,
        ctx,
      );
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
  return resolved;
};

export interface CanonicalDeclarationBase {
  path: string;
  parsedSource: ParsedSource;
  jsDoc: JSONSchema7;
}
export interface FunctionCanonicalDeclaration extends CanonicalDeclarationBase {
  exp: FunctionExpression | FunctionDeclaration;
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
  for (const spec of item.specifiers) {
    if (
      spec.type === "ExportSpecifier" &&
      (spec.exported?.value ?? spec.orig.value) === funcName
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
      const url = importMapResolver.resolve(source, path);
      if (!url) {
        return undefined;
      }
      const isFromDefault = spec.orig.value === "default";
      const newProgram = await parsePath(url);
      if (!newProgram) {
        return undefined;
      }
      if (isFromDefault) {
        return findDefaultFuncExport(importMapResolver, url, newProgram);
      } else {
        return findFuncExport(
          importMapResolver,
          spec.orig.value,
          url,
          newProgram,
        );
      }
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
  for (const item of parsedSource.program.body) {
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

const paramsOf = (
  canonical: CanonicalDeclaration,
): TsType[] | undefined => {
  if (isVariableDeclaration(canonical)) {
    const loader = getWellKnownLoaderType(canonical.declarator);
    if (loader) {
      return [loader[0]];
    }
  }
  const exp = canonical?.exp;
  if (!exp || !("params" in exp)) {
    return undefined;
  }
  return exp.params?.map((param) => {
    const pat = (param as Param)?.pat ?? param as Pattern;
    const typeAnnotation = (pat as { typeAnnotation?: TsTypeAnnotation })
      ?.typeAnnotation?.typeAnnotation;
    return typeAnnotation!;
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
    return {
      ...baseBlockRef,
      inputSchema: await tsTypeToSchemeable(param, {
        importMapResolver,
        path,
        parsedSource,
        references: schemeableReferences,
      }),
    };
  }
  return undefined;
};

const useEsm = (npmSpecifier: string) => {
  const withoutNpm = npmSpecifier.substring("https://esm.sh/".length);
  return `https://esm.sh/${withoutNpm}`;
};
export function resolveSpecifier(specifier: string, context: string) {
  // should use origin
  if (specifier.startsWith("/")) {
    const pathUrl = new URL(import.meta.resolve(context));
    return `${pathUrl.origin}${specifier}`;
  }

  // relative import
  if (specifier.startsWith(".")) {
    return import.meta.resolve(
      new URL(specifier, import.meta.resolve(context)).toString(),
    );
  }

  if (specifier.startsWith("https://esm.sh/")) {
    return useEsm(specifier);
  }
  // import from import_map
  return import.meta.resolve(specifier);
}
