import { JSONSchema7, JSONSchema7Type } from "$live/deps.ts";
import { BlockModuleRef, IntrospectParams } from "$live/engine/block.ts";
import { parsePath } from "$live/engine/schema/swc/swc.ts";
import { Schemeable } from "$live/engine/schema/transform.ts";
import type { ParsedSource } from "https://denopkg.com/deco-cx/deno_ast_wasm@0.1.0/mod.ts";
import type {
  ArrowFunctionExpression,
  ExportNamedDeclaration,
  FunctionDeclaration,
  FunctionExpression,
  NamedExportSpecifier,
  NamedImportSpecifier,
  Param,
  Pattern,
  StringLiteral,
  TsArrayType,
  TsIndexedAccessType,
  TsInterfaceDeclaration,
  TsIntersectionType,
  TsKeywordType,
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
  TsTypeReference,
  TsUnionType,
} from "https://esm.sh/v130/@swc/wasm@1.3.76";
import { JSONSchema7TypeName } from "https://esm.sh/v130/@types/json-schema@7.0.11/index.d.ts";
import { dirname, fromFileUrl, join, toFileUrl } from "std/path/mod.ts";
import { ObjectSchemeable, UnknownSchemable } from "../transform.ts";

export interface SchemeableTransformContext {
  path: string;
  parsedSource: ParsedSource;
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
  {
    path,
    parsedSource,
    instantiatedTypeParams,
    tryGetFromInstantiatedParameters,
  }: SchemeableTransformContext,
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
    if (key.type !== "Identifier") {
      continue;
    }
    keysPromise.push(
      tsTypeToSchemeable(prop.typeAnnotation.typeAnnotation, {
        path,
        parsedSource,
        instantiatedTypeParams,
        tryGetFromInstantiatedParameters,
      })
        .then((
          schemeable,
        ) => [
          key.value,
          {
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
  {
    tryGetFromInstantiatedParameters: _tryGetFromInstantiatedParameters,
    path,
    parsedSource,
    instantiatedTypeParams,
  }: SchemeableTransformContext,
): SchemeableTransformContext["tryGetFromInstantiatedParameters"] => {
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
          path,
          parsedSource,
          instantiatedTypeParams,
          tryGetFromInstantiatedParameters: _tryGetFromInstantiatedParameters,
        })
        : undefined);
  };
};
const tsInterfaceDeclarationToSchemeable = async (
  dec: TsInterfaceDeclaration,
  {
    path,
    parsedSource,
    instantiatedTypeParams,
    tryGetFromInstantiatedParameters: _tryGetFromInstantiatedParameters,
  }: SchemeableTransformContext,
): Promise<Schemeable> => {
  const allOfs: Promise<Schemeable>[] = [];
  const params = dec.typeParams?.parameters ?? [];

  const tryGetFromInstantiatedParameters = getFromParametersFunc(params, {
    path,
    parsedSource,
    instantiatedTypeParams,
    tryGetFromInstantiatedParameters: _tryGetFromInstantiatedParameters,
  });
  for (const ext of dec.extends) {
    if (ext.expression.type === "Identifier") {
      allOfs.push(
        typeNameToSchemeable(ext.expression.value, {
          path,
          parsedSource,
          instantiatedTypeParams,
          tryGetFromInstantiatedParameters,
        }),
      );
    }
  }
  const objectSchemeable = await tsTypeElementsToObjectSchemeable(
    dec.body.body,
    {
      path,
      parsedSource,
      instantiatedTypeParams,
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
const typeNameToSchemeable = async (
  typeName: string,
  {
    path,
    parsedSource,
    instantiatedTypeParams,
    tryGetFromInstantiatedParameters,
  }: SchemeableTransformContext,
): Promise<Schemeable> => {
  const { program } = parsedSource;
  const val = await tryGetFromInstantiatedParameters?.(typeName);
  if (val) {
    return val;
  }
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
        const source = (item as ExportNamedDeclaration).source!.value;
        const fileUrl = source.startsWith(".")
          ? join(
            Deno.cwd(),
            dirname(path),
            (item as ExportNamedDeclaration).source!.value,
          )
          : source;
        const from = import.meta.resolve(
          fileUrl,
        );
        const newProgram = await parsePath(from);
        if (!newProgram) {
          return UNKNOWN;
        }
        return typeNameToSchemeable(
          _spec.exported?.value ?? _spec.orig.value,
          {
            path: from,
            parsedSource: newProgram,
            instantiatedTypeParams,
            tryGetFromInstantiatedParameters,
          },
        );
      }
    }
    if (
      item.type === "ExportDeclaration" &&
      item.declaration.type === "TsInterfaceDeclaration" &&
      item.declaration.id.value === typeName
    ) {
      return tsInterfaceDeclarationToSchemeable(item.declaration, {
        path,
        parsedSource,
        instantiatedTypeParams,
        tryGetFromInstantiatedParameters,
      });
    }
    if (
      item.type === "ExportDeclaration" &&
      item.declaration.type === "TsTypeAliasDeclaration" &&
      item.declaration.id.value === typeName
    ) {
      const _tryGetFromInstantiatedParameters = getFromParametersFunc(
        item.declaration.typeParams?.parameters ?? [],
        {
          path,
          parsedSource,
          instantiatedTypeParams,
          tryGetFromInstantiatedParameters,
        },
      );
      return tsTypeToSchemeable(item.declaration.typeAnnotation, {
        path,
        parsedSource,
        instantiatedTypeParams,
        tryGetFromInstantiatedParameters: _tryGetFromInstantiatedParameters,
      });
    }
    if (
      item.type === "TsInterfaceDeclaration" &&
      item.id.value === typeName
    ) {
      return tsInterfaceDeclarationToSchemeable(item, {
        path,
        parsedSource,
        instantiatedTypeParams,
        tryGetFromInstantiatedParameters,
      });
    }
    if (
      item.type === "TsTypeAliasDeclaration" &&
      item.id.value === typeName
    ) {
      const _tryGetFromInstantiatedParameters = getFromParametersFunc(
        item.typeParams?.parameters ?? [],
        {
          path,
          parsedSource,
          instantiatedTypeParams,
          tryGetFromInstantiatedParameters,
        },
      );
      return tsTypeToSchemeable(item.typeAnnotation, {
        path,
        parsedSource,
        instantiatedTypeParams,
        tryGetFromInstantiatedParameters: _tryGetFromInstantiatedParameters,
      });
    }
    if (
      item.type === "ImportDeclaration"
    ) {
      const spec = item.specifiers.find((spec) =>
        spec.local.value === typeName
      );
      if (spec) {
        try {
          const fromTarget = item.source.value.startsWith(".")
            ? join(
              dirname(fromFileUrl(import.meta.resolve(
                path,
              ))),
              item.source.value,
            )
            : import.meta.resolve(item.source.value);
          const newProgram = await parsePath(
            fromTarget.startsWith("http")
              ? fromTarget
              : fromTarget.startsWith("file")
              ? fromTarget
              : toFileUrl(fromTarget).toString(),
          );
          if (!newProgram) {
            return UNKNOWN;
          }
          return typeNameToSchemeable(
            (spec as NamedImportSpecifier)?.imported?.value ?? spec.local.value,
            {
              path: fromTarget,
              parsedSource: newProgram,
              instantiatedTypeParams,
              tryGetFromInstantiatedParameters,
            },
          );
        } catch (err) {
          console.log(err, item.source.value, path, import.meta.resolve(path));
          throw err;
        }
      }
    }
  }
  return UNKNOWN;
};

const wellKnownTypeReferenceToSchemeable = async (
  ref: TsTypeReference,
  {
    path,
    parsedSource,
    instantiatedTypeParams,
    tryGetFromInstantiatedParameters,
  }: SchemeableTransformContext,
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
        {
          path,
          parsedSource,
          instantiatedTypeParams,
          tryGetFromInstantiatedParameters,
        },
      );

      return {
        type: "record",
        name: `record${recordSchemeable.name}`,
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
        {
          path,
          parsedSource,
          instantiatedTypeParams,
          tryGetFromInstantiatedParameters,
        },
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
      return {
        type: "inline",
        name: `InstanceOf@${btoa(literal.value)}`,
        value: {
          $ref: literal.value,
        },
      };
    }
    case "BlockInstance": {
      if (typeParams.length < 1) {
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
      return {
        type: "inline",
        name: `BlockInstance@${btoa(literal.value)}`,
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
        {
          path,
          parsedSource,
          instantiatedTypeParams,
          tryGetFromInstantiatedParameters,
        },
      );
    }
    case "Partial": {
      if (typeParams.length < 1) {
        return UNKNOWN;
      }
      const schemeable = await tsTypeToSchemeable(
        typeParams[0],
        {
          path,
          parsedSource,
          instantiatedTypeParams,
          tryGetFromInstantiatedParameters,
        },
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
        {
          path,
          parsedSource,
          instantiatedTypeParams,
          tryGetFromInstantiatedParameters,
        },
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
        {
          path,
          parsedSource,
          instantiatedTypeParams,
          tryGetFromInstantiatedParameters,
        },
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
          name: "array@unknown",
          type: "array",
          value: UNKNOWN,
        };
      }
      const typeSchemeable = await tsTypeToSchemeable(
        typeParams[0],
        {
          path,
          parsedSource,
          instantiatedTypeParams,
          tryGetFromInstantiatedParameters,
        },
      );

      return {
        type: "array",
        name: `array@${typeSchemeable.name}`,
        value: typeSchemeable,
      };
    }
    case "Promise": {
      if (typeParams.length < 1) {
        return UNKNOWN;
      }
      return tsTypeToSchemeable(
        typeParams[0],
        {
          path,
          parsedSource,
          instantiatedTypeParams,
          tryGetFromInstantiatedParameters,
        },
      );
    }
    case "LoaderReturnType": {
      if (typeParams.length < 1) {
        return UNKNOWN;
      }
      return tsTypeToSchemeable(
        typeParams[0],
        {
          path,
          parsedSource,
          instantiatedTypeParams,
          tryGetFromInstantiatedParameters,
        },
      );
    }
  }
};
// cannot have typeParams but can have type parameters on context
export const tsTypeToSchemeable = async (
  tsType: TsType,
  {
    path,
    parsedSource,
    instantiatedTypeParams,
    tryGetFromInstantiatedParameters,
  }: SchemeableTransformContext,
): Promise<Schemeable> => {
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
        name: `${constVal}`,
        value: {
          type: literalToJsonSchemaType[type.literal.type], // FIXME(mcandeia) not compliant with JSONSchema
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
      const schemeable = await tsTypeToSchemeable(type.objectType, {
        path,
        parsedSource,
        instantiatedTypeParams,
        tryGetFromInstantiatedParameters,
      });
      if (schemeable.type === "object" && indexType.type === "StringLiteral") {
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
      if (schemeable.type === "array" && indexType.type === "NumericLiteral") {
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
      return tsTypeToSchemeable(type.typeAnnotation, {
        path,
        parsedSource,
        instantiatedTypeParams,
        tryGetFromInstantiatedParameters,
      });
    }
    case "TsIntersectionType": {
      const type = tsType as TsIntersectionType;
      const value = await Promise.all(
        type.types.map((tp) =>
          tsTypeToSchemeable(tp, {
            path,
            parsedSource,
            instantiatedTypeParams,
            tryGetFromInstantiatedParameters,
          })
        ),
      );
      return {
        file: path,
        name: value.map((v) => v.name).join("&"),
        type: "intersection",
        value,
      };
    }
    case "TsUnionType": {
      const type = tsType as TsUnionType;
      const value = await Promise.all(
        type.types.map((tp) =>
          tsTypeToSchemeable(tp, {
            path,
            parsedSource,
            instantiatedTypeParams,
            tryGetFromInstantiatedParameters,
          })
        ),
      );
      return {
        file: path,
        type: "union",
        name: value.map((v) => v.name).join("|"),
        value,
      };
    }
    case "TsOptionalType": {
      const type = tsType as TsOptionalType;
      const genType = await tsTypeToSchemeable(type.typeAnnotation, {
        path,
        parsedSource,
        instantiatedTypeParams,
        tryGetFromInstantiatedParameters,
      });
      return {
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
        type.elemTypes.map((tp) =>
          tsTypeToSchemeable(tp.ty, {
            path,
            parsedSource,
            instantiatedTypeParams,
            tryGetFromInstantiatedParameters,
          })
        ),
      );
      return {
        type: "array",
        name: `tuple@${value.map((v) => v.name).join("|")}`,
        value,
      };
    }
    case "TsArrayType": {
      const type = tsType as TsArrayType;
      const value = await tsTypeToSchemeable(type.elemType, {
        path,
        parsedSource,
        instantiatedTypeParams,
        tryGetFromInstantiatedParameters,
      });
      return {
        type: "array",
        name: `array@${value.name}`,
        value,
      };
    }
    case "TsTypeLiteral": {
      const type = tsType as TsTypeLiteral;
      return {
        file: path,
        name: `typeLiteral@${tsType.span.start}-${tsType.span.end}`,
        ...await tsTypeElementsToObjectSchemeable(type.members, {
          path,
          parsedSource,
          instantiatedTypeParams,
          tryGetFromInstantiatedParameters,
        }),
      };
    }
    case "TsKeywordType": {
      const type = tsType as TsKeywordType;
      const keywordToType: Record<string, JSONSchema7Type> = {
        undefined: "null",
        any: "object",
        never: "object",
      };

      if (type.kind === "never") {
        console.warn(
          `never keyword is being used on ${path}, falling back to object`,
        );
      }
      const jsonSchemaType = keywordToType[type.kind] ?? type.kind;
      return {
        type: "inline",
        name: `literal${jsonSchemaType}`,
        value: type
          ? ({
            type: jsonSchemaType,
          } as JSONSchema7)
          : {},
      };
    }
    case "TsTypeReference": {
      const type = tsType as TsTypeReference;
      if (type.typeName.type !== "Identifier") {
        return UNKNOWN;
      }
      const wellKnownType = await wellKnownTypeReferenceToSchemeable(type, {
        path,
        parsedSource,
        instantiatedTypeParams,
        tryGetFromInstantiatedParameters,
      });

      if (wellKnownType) {
        return wellKnownType;
      }
      const typeName = type.typeName.value;
      const parameters = type.typeParams?.params ?? [];
      const typeParams = await Promise.all(parameters.map((param) => {
        return tsTypeToSchemeable(param, {
          path,
          parsedSource,
          instantiatedTypeParams,
          tryGetFromInstantiatedParameters,
        });
      }));

      const schemeable = await typeNameToSchemeable(typeName, {
        path,
        parsedSource,
        instantiatedTypeParams: typeParams,
        tryGetFromInstantiatedParameters,
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

export interface FunctionCanonicalDeclaration {
  exp: FunctionExpression | FunctionDeclaration | ArrowFunctionExpression;
  path: string;
  parsedSource: ParsedSource;
}
const findFuncFromExportNamedDeclaration = async (
  funcName: string,
  item: ExportNamedDeclaration,
  path: string,
): Promise<FunctionCanonicalDeclaration | undefined> => {
  for (const spec of item.specifiers) {
    if (
      item.source !== undefined &&
      spec.type === "ExportSpecifier" &&
      (spec.exported?.value ?? spec.orig.value) === funcName
    ) {
      const fileUrl = item.source.value.startsWith(".")
        ? join(
          Deno.cwd(),
          dirname(path),
          item.source.value,
        )
        : item.source.value;
      const from = import.meta.resolve(
        fileUrl,
      );
      const isFromDefault = spec.orig.value === "default";
      const newProgram = await parsePath(from);
      if (!newProgram) {
        return undefined;
      }
      if (isFromDefault) {
        return findDefaultFuncExport(from, newProgram);
      } else {
        return findFuncExport(spec.orig.value, from, newProgram);
      }
    }
  }
  return undefined;
};

const findFunc = async (
  funcName: string,
  path: string,
  parsedSource: ParsedSource,
): Promise<[FunctionCanonicalDeclaration, boolean] | undefined> => {
  for (const item of parsedSource.program.body) {
    if (item.type === "ExportNamedDeclaration") {
      const found = await findFuncFromExportNamedDeclaration(
        funcName,
        item,
        path,
      );
      if (found) {
        return [found, true];
      }
    }

    if (
      item.type === "FunctionDeclaration" &&
      item.identifier.value === funcName
    ) {
      return [{ path, parsedSource, exp: item }, false];
    }

    if (
      item.type === "VariableDeclaration"
    ) {
      for (const decl of item.declarations) {
        if (
          decl.id.type === "Identifier" && decl.id.value === funcName &&
          decl.init && decl.init.type === "ArrowFunctionExpression"
        ) {
          return [{ path, parsedSource, exp: decl.init }, false];
        }
      }
    }

    if (
      item.type === "ExportDeclaration" &&
      item.declaration.type === "FunctionDeclaration" &&
      item.declaration.identifier.value === funcName
    ) {
      return [{ path, parsedSource, exp: item.declaration }, true];
    }

    if (
      item.type === "ExportDeclaration" &&
      item.declaration.type === "VariableDeclaration"
    ) {
      for (const decl of item.declaration.declarations) {
        if (
          decl.id.type === "Identifier" && decl.id.value === funcName &&
          decl.init && decl.init.type === "ArrowFunctionExpression"
        ) {
          return [{ path, parsedSource, exp: decl.init }, true];
        }
      }
    }
  }
};
const findFuncExport = async (
  funcName: string,
  path: string,
  program: ParsedSource,
): Promise<FunctionCanonicalDeclaration | undefined> => {
  const func = await findFunc(funcName, path, program);
  if (!func) {
    return undefined;
  }
  return func[1] ? func[0] : undefined;
};
export const findDefaultFuncExport = async (
  path: string,
  parsedSource: ParsedSource,
): Promise<FunctionCanonicalDeclaration | undefined> => {
  for (const item of parsedSource.program.body) {
    if (
      item.type === "ExportDefaultExpression" &&
      item.expression.type === "Identifier"
    ) {
      const func = await findFunc(item.expression.value, path, parsedSource);
      return func?.[0];
    }
    if (
      item.type === "ExportDefaultDeclaration" &&
      item.decl.type === "FunctionExpression"
    ) {
      return { exp: item.decl, path, parsedSource };
    }
    if (item.type === "ExportNamedDeclaration") {
      const found = await findFuncFromExportNamedDeclaration(
        "default",
        item,
        path,
      );
      if (found) {
        return found;
      }
    }
  }
  return undefined;
};
export const programToBlockRef = async (
  _path: string,
  _program: ParsedSource,
  introspect?: IntrospectParams,
): Promise<BlockModuleRef | undefined> => {
  const funcNames = introspect?.funcNames ?? ["default"];
  for (const name of funcNames) {
    const fn = name === "default"
      ? await findDefaultFuncExport(_path, _program)
      : await findFuncExport(name, _path, _program);
    if (!fn) {
      continue;
    }

    const includeReturn = introspect?.includeReturn;
    const { exp: func, path, parsedSource } = fn;

    const retn = typeof includeReturn === "function"
      ? func.returnType
        ? includeReturn(func.returnType.typeAnnotation)
        : undefined
      : func.returnType?.typeAnnotation;

    const baseBlockRef = {
      functionJSDoc: undefined, //func.jsDoc && jsDocToSchema(func.jsDoc),
      functionRef: path,
      outputSchema: includeReturn && retn
        ? await tsTypeToSchemeable(retn, { path, parsedSource })
        : undefined,
    };
    const paramIdx = 0;
    if (func.params.length === 0) {
      return baseBlockRef;
    }
    const param = func.params[paramIdx];
    const pat = (param as Param)?.pat ?? param as Pattern;
    const typeAnnotation = (pat as { typeAnnotation?: TsTypeAnnotation })
      ?.typeAnnotation?.typeAnnotation;
    if (!typeAnnotation) {
      return baseBlockRef;
    }
    return {
      ...baseBlockRef,
      inputSchema: await tsTypeToSchemeable(typeAnnotation, {
        path,
        parsedSource,
      }),
    };
  }
  return undefined;
};
