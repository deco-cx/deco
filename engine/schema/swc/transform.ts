import { JSONSchema7, JSONSchema7Type } from "$live/deps.ts";
import { BlockModuleRef, IntrospectParams } from "$live/engine/block.ts";
import { parsePath } from "$live/engine/schema/swc/swc.ts";
import { Schemeable } from "$live/engine/schema/transform.ts";
import {
  ArrowFunctionExpression,
  ExportNamedDeclaration,
  FunctionDeclaration,
  FunctionExpression,
  NamedExportSpecifier,
  NamedImportSpecifier,
  Param,
  Pattern,
  Program,
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
  TsTypeReference,
  TsUnionType,
} from "https://esm.sh/v130/@swc/core@1.2.212/types.d.ts";
import { JSONSchema7TypeName } from "https://esm.sh/v130/@types/json-schema@7.0.11/index.d.ts";
import { dirname, join } from "std/path/mod.ts";
import { ObjectSchemeable, UnknownSchemable } from "../transform.ts";

export interface SchemeableTransformContext {
  path: string;
  program: Program;
  instantiatedTypeParams?: (() => Promise<Schemeable>)[];
  tryGetFromInstantiatedParameters?: (
    name: string,
  ) => Promise<Schemeable> | undefined;
}

const UNKNOWN: UnknownSchemable = {
  type: "unknown",
};

const tsTypeElementsToObjectSchemeable = async (
  tsTypeElements: TsTypeElement[],
  { path, program, tryGetFromInstantiatedParameters }:
    SchemeableTransformContext,
): Promise<ObjectSchemeable> => {
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
        program,
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
  const schemeable: ObjectSchemeable = {
    type: "object",
    value: {},
  };
  for (const [key, value] of keys) {
    schemeable.value[key] = value;
  }
  return schemeable;
};

const tsInterfaceDeclarationToSchemeable = async (
  dec: TsInterfaceDeclaration,
  {
    path,
    program,
    instantiatedTypeParams,
    tryGetFromInstantiatedParameters: _tryGetFromInstantiatedParameters,
  }: SchemeableTransformContext,
): Promise<Schemeable> => {
  const allOfs: Promise<Schemeable>[] = [];
  const typeParamNameToIdx: Record<string, { idx: number; default: TsType }> =
    {};
  const params = dec.typeParams?.parameters ?? [];

  for (let paramIdx = 0; paramIdx < params.length; paramIdx++) {
    const param = params[paramIdx];
    typeParamNameToIdx[param.name.value] = {
      idx: paramIdx,
      default: param.default,
    };
  }
  const tryGetFromInstantiatedParameters = (
    name: string,
  ): Promise<Schemeable> | undefined => {
    const val = typeParamNameToIdx[name];
    if (!val) {
      return undefined;
    }
    return instantiatedTypeParams?.[val.idx]?.() ??
      _tryGetFromInstantiatedParameters?.(name) ??
      tsTypeToSchemeable(val.default, {
        path,
        program,
        instantiatedTypeParams,
      });
  };
  for (const ext of dec.extends) {
    if (ext.expression.type === "Identifier") {
      allOfs.push(
        typeNameToSchemeable(ext.expression.value, {
          path,
          program,
          tryGetFromInstantiatedParameters,
        }),
      );
    }
  }
  const objectSchemeable = await tsTypeElementsToObjectSchemeable(
    dec.body.body,
    {
      path,
      program,
      tryGetFromInstantiatedParameters,
    },
  );
  return {
    ...objectSchemeable,
    extends: await Promise.all(allOfs),
  };
};
// cannot have typeParams but can have type parameters on context
const typeNameToSchemeable = async (
  typeName: string,
  { path, program, instantiatedTypeParams, tryGetFromInstantiatedParameters }:
    SchemeableTransformContext,
): Promise<Schemeable> => {
  const val = tryGetFromInstantiatedParameters?.(typeName);
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
            program: newProgram,
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
        program,
        instantiatedTypeParams,
        tryGetFromInstantiatedParameters,
      });
    }
    if (
      item.type === "ExportDeclaration" &&
      item.declaration.type === "TsTypeAliasDeclaration" &&
      item.declaration.id.value === typeName
    ) {
      return tsTypeToSchemeable(item.declaration.typeAnnotation, {
        path,
        program,
        instantiatedTypeParams,
        tryGetFromInstantiatedParameters,
      });
    }
    if (
      item.type === "TsInterfaceDeclaration" &&
      item.id.value === typeName
    ) {
      return tsInterfaceDeclarationToSchemeable(item, {
        path,
        program,
        instantiatedTypeParams,
        tryGetFromInstantiatedParameters,
      });
    }
    if (
      item.type === "TsTypeAliasDeclaration" &&
      item.id.value === typeName
    ) {
      return tsTypeToSchemeable(item.typeAnnotation, {
        path,
        program,
        instantiatedTypeParams,
        tryGetFromInstantiatedParameters,
      });
    }
    if (
      item.type === "ImportDeclaration"
    ) {
      const spec = item.specifiers.find((spec) =>
        spec.local.value === typeName
      );
      if (spec) {
        const from = import.meta.resolve(
          join(Deno.cwd(), dirname(path), item.source.value),
        );
        const newProgram = await parsePath(from);
        if (!newProgram) {
          return UNKNOWN;
        }
        return typeNameToSchemeable(
          (spec as NamedImportSpecifier)?.imported?.value ?? spec.local.value,
          {
            path: from,
            program: newProgram,
            instantiatedTypeParams,
            tryGetFromInstantiatedParameters,
          },
        );
      }
    }
  }
  return UNKNOWN;
};

const wellKnownTypeReferenceToSchemeable = async (
  ref: TsTypeReference,
  { path, program, tryGetFromInstantiatedParameters }:
    SchemeableTransformContext,
): Promise<Schemeable | undefined> => {
  const typeName = ref.typeName;
  if (typeName.type !== "Identifier") {
    return undefined;
  }
  const name = typeName.value;

  switch (name) {
    case "Record": {
      if (ref.typeParams.params.length !== 2) {
        return UNKNOWN;
      }

      const secondParam = ref.typeParams.params[1];

      const recordSchemeable = await tsTypeToSchemeable(
        secondParam,
        { path, program, tryGetFromInstantiatedParameters },
      );

      return {
        type: "record",
        value: recordSchemeable,
      };
    }
    case "PreactComponent": {
      if (ref.typeParams.params.length < 1) {
        return UNKNOWN;
      }
      const typeRef = ref.typeParams.params[0];

      return tsTypeToSchemeable(
        typeRef,
        { path, program, tryGetFromInstantiatedParameters },
      );
    }
    case "Response": {
      return {
        type: "inline",
        value: {
          $ref: "#/root/handlers",
        },
      };
    }
    case "InstanceOf": {
      if (ref.typeParams.params.length < 2) {
        return undefined;
      }
      const configName = ref.typeParams.params[1];
      if (configName.type !== "TsLiteralType") {
        return undefined;
      }
      const literal = (configName as TsLiteralType).literal;
      if (literal.type !== "StringLiteral") {
        return undefined;
      }
      return {
        type: "inline",
        value: {
          $ref: literal.value,
        },
      };
    }
    case "BlockInstance": {
      if (ref.typeParams.params.length < 1) {
        return undefined;
      }
      const configName = ref.typeParams.params[1];
      if (configName.type !== "TsLiteralType") {
        return undefined;
      }
      const literal = (configName as TsLiteralType).literal;
      if (literal.type !== "StringLiteral") {
        return undefined;
      }
      return {
        type: "inline",
        value: {
          $ref: `#/definitions/${btoa(literal.value)}`,
        },
      };
    }
    case "Resolvable": {
      if (ref.typeParams.params.length < 1) {
        return {
          type: "inline",
          value: {
            $ref: "#/definitions/Resolvable",
          },
        };
      }
      const typeRef = ref.typeParams.params[0];

      return tsTypeToSchemeable(
        typeRef,
        { path, program, tryGetFromInstantiatedParameters },
      );
    }
    case "Partial": {
      if (ref.typeParams.params.length < 1) {
        return UNKNOWN;
      }
      const schemeable = await tsTypeToSchemeable(
        ref.typeParams.params[0],
        { path, program },
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
        value: newProperties,
      };
    }
    case "Omit": {
      if (
        ref.typeParams.params.length < 2
      ) {
        return UNKNOWN;
      }
      const schemeable = await tsTypeToSchemeable(
        ref.typeParams.params[0],
        { path, program, tryGetFromInstantiatedParameters },
      );
      if (schemeable.type === "object") { // TODO(mcandeia) support arrays, unions and intersections
        const omitKeys = ref.typeParams.params[1] as TsUnionType;
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
            }
          }
        }
        const omitKeysAsLiteral = ref.typeParams.params[1] as TsLiteralType;
        if (
          omitKeysAsLiteral?.type === "TsLiteralType" &&
          (omitKeysAsLiteral?.literal as TsLiteral)?.type === "StringLiteral"
        ) {
          const val =
            ((omitKeysAsLiteral as TsLiteralType).literal as StringLiteral)
              .value;
          delete (schemeable.value[val]);
        }
      }
      return schemeable;
    }
    case "Pick": {
      if (
        ref.typeParams.params.length < 2
      ) {
        return UNKNOWN;
      }
      const schemeable = await tsTypeToSchemeable(
        ref.typeParams.params[0],
        { path, program, tryGetFromInstantiatedParameters },
      );
      if (schemeable.type === "object") { // TODO(mcandeia) support arrays, unions and intersections
        const newValue: typeof schemeable["value"] = {};
        const pickKeys = ref.typeParams.params[1] as TsUnionType;
        if (pickKeys?.types) {
          for (const value of pickKeys?.types) {
            if (
              value.type === "TsLiteralType" &&
              (value as TsLiteralType).literal.type === "StringLiteral"
            ) {
              const val =
                ((value as TsLiteralType).literal as StringLiteral).value;
              newValue[val] = schemeable.value[val];
            }
          }
        }
        const omitKeysAsLiteral = ref.typeParams.params[1] as TsLiteralType;
        if (
          omitKeysAsLiteral?.type === "TsLiteralType" &&
          (omitKeysAsLiteral?.literal as TsLiteral)?.type === "StringLiteral"
        ) {
          const val =
            ((omitKeysAsLiteral as TsLiteralType).literal as StringLiteral)
              .value;
          newValue[val] = schemeable.value[val];
        }
      }
      return schemeable;
    }
    case "Array": {
      if (ref.typeParams.params.length < 1) {
        return {
          type: "array",
          value: UNKNOWN,
        };
      }
      const typeSchemeable = await tsTypeToSchemeable(
        ref.typeParams.params[0],
        { path, program, tryGetFromInstantiatedParameters },
      );

      return {
        type: "array",
        value: typeSchemeable,
      };
    }
    case "Promise": {
      if (ref.typeParams.params.length < 1) {
        return UNKNOWN;
      }
      return tsTypeToSchemeable(
        ref.typeParams.params[0],
        { path, program, tryGetFromInstantiatedParameters },
      );
    }
    case "LoaderReturnType": {
      if (ref.typeParams.params.length < 1) {
        return UNKNOWN;
      }
      return tsTypeToSchemeable(
        ref.typeParams.params[0],
        { path, program, tryGetFromInstantiatedParameters },
      );
    }
  }
};
// cannot have typeParams but can have type parameters on context
export const tsTypeToSchemeable = async (
  tsType: TsType,
  { path, program, tryGetFromInstantiatedParameters }:
    SchemeableTransformContext,
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
      return {
        type: "inline",
        value: {
          type: literalToJsonSchemaType[type.literal.type], // FIXME(mcandeia) not compliant with JSONSchema
          const: value,
          default: value,
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
        program,
        tryGetFromInstantiatedParameters,
      });
      if (schemeable.type === "object" && indexType.type === "StringLiteral") {
        const { [indexType.value]: prop } = schemeable.value;
        return {
          ...schemeable,
          value: {
            [indexType.value]: prop,
          },
        };
      }
      if (schemeable.type === "array" && indexType.type === "NumericLiteral") {
        const itemSchemeable = Array.isArray(schemeable.value)
          ? schemeable.value[indexType.value]
          : schemeable.value;
        return itemSchemeable;
      }
      return UNKNOWN;
    }
    case "TsParenthesizedType": {
      const type = tsType as TsParenthesizedType;
      return tsTypeToSchemeable(type.typeAnnotation, {
        path,
        program,
        tryGetFromInstantiatedParameters,
      });
    }
    case "TsIntersectionType": {
      const type = tsType as TsIntersectionType;
      return {
        type: "intersection",
        value: await Promise.all(
          type.types.map((tp) =>
            tsTypeToSchemeable(tp, {
              path,
              program,
              tryGetFromInstantiatedParameters,
            })
          ),
        ),
      };
    }
    case "TsUnionType": {
      const type = tsType as TsUnionType;
      return {
        type: "union",
        value: await Promise.all(
          type.types.map((tp) =>
            tsTypeToSchemeable(tp, {
              path,
              program,
              tryGetFromInstantiatedParameters,
            })
          ),
        ),
      };
    }
    case "TsOptionalType": {
      const type = tsType as TsOptionalType;
      return {
        type: "union",
        value: [
          {
            type: "inline",
            value: {
              type: "null",
            },
          },
          await tsTypeToSchemeable(type.typeAnnotation, {
            path,
            program,
            tryGetFromInstantiatedParameters,
          }),
        ],
      };
    }
    case "TsTupleType": {
      const type = tsType as TsTupleType;
      return {
        type: "array",
        value: await Promise.all(
          type.elemTypes.map((tp) =>
            tsTypeToSchemeable(tp, {
              path,
              program,
              tryGetFromInstantiatedParameters,
            })
          ),
        ),
      };
    }
    case "TsArrayType": {
      const type = tsType as TsArrayType;
      return {
        type: "array",
        value: await tsTypeToSchemeable(type.elemType, {
          path,
          program,
          tryGetFromInstantiatedParameters,
        }),
      };
    }
    case "TsTypeLiteral": {
      const type = tsType as TsTypeLiteral;
      return tsTypeElementsToObjectSchemeable(type.members, {
        path,
        program,
        tryGetFromInstantiatedParameters,
      });
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
        program,
        tryGetFromInstantiatedParameters,
      });

      if (wellKnownType) {
        return wellKnownType;
      }
      const typeName = type.typeName.value;
      const typeParams = type.typeParams?.params?.map((param) => {
        return () =>
          tsTypeToSchemeable(param, {
            path,
            program,
            tryGetFromInstantiatedParameters,
          });
      });

      return await typeNameToSchemeable(typeName, {
        path,
        program,
        instantiatedTypeParams: typeParams,
        tryGetFromInstantiatedParameters,
      });
    }
    default:
      return UNKNOWN;
  }
};

export interface FunctionCanonicalDeclaration {
  exp: FunctionExpression | FunctionDeclaration | ArrowFunctionExpression;
  path: string;
  program: Program;
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
  program: Program,
): Promise<[FunctionCanonicalDeclaration, boolean] | undefined> => {
  for (const item of program.body) {
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
      return [{ path, program, exp: item }, false];
    }

    if (
      item.type === "VariableDeclaration"
    ) {
      for (const decl of item.declarations) {
        if (
          decl.id.type === "Identifier" && decl.id.value === funcName &&
          decl.init && decl.init.type === "ArrowFunctionExpression"
        ) {
          return [{ path, program, exp: decl.init }, false];
        }
      }
    }

    if (
      item.type === "ExportDeclaration" &&
      item.declaration.type === "FunctionDeclaration" &&
      item.declaration.identifier.value === funcName
    ) {
      return [{ path, program, exp: item.declaration }, true];
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
          return [{ path, program, exp: decl.init }, true];
        }
      }
    }
  }
};
const findFuncExport = async (
  funcName: string,
  path: string,
  program: Program,
): Promise<FunctionCanonicalDeclaration | undefined> => {
  const func = await findFunc(funcName, path, program);
  if (!func) {
    return undefined;
  }
  return func[1] ? func[0] : undefined;
};
export const findDefaultFuncExport = async (
  path: string,
  program: Program,
): Promise<FunctionCanonicalDeclaration | undefined> => {
  for (const item of program.body) {
    if (
      item.type === "ExportDefaultExpression" &&
      item.expression.type === "Identifier"
    ) {
      const func = await findFunc(item.expression.value, path, program);
      return func?.[0];
    }
    if (
      item.type === "ExportDefaultDeclaration" &&
      item.decl.type === "FunctionExpression"
    ) {
      return { exp: item.decl, path, program };
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
  _program: Program,
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
    const { exp: func, path, program } = fn;

    const retn = typeof includeReturn === "function"
      ? func.returnType
        ? includeReturn(func.returnType.typeAnnotation)
        : undefined
      : func.returnType?.typeAnnotation;

    const baseBlockRef = {
      functionJSDoc: undefined, //func.jsDoc && jsDocToSchema(func.jsDoc),
      functionRef: path,
      outputSchema: includeReturn && retn
        ? await tsTypeToSchemeable(retn, { path, program })
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
      inputSchema: { ...await tsTypeToSchemeable(typeAnnotation, { path, program }), file: "https://denopkg.com/deco-cx/deco@1.2.3/a.ts", name: `${Math.random()}` },
    };
  }
  return undefined;
};
