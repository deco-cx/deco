import { JSONSchema7, JSONSchema7Type } from "$live/deps.ts";
import { beautify, denoDoc, jsDocToSchema } from "$live/engine/schema/utils.ts";
import { fromFileUrlOrNoop } from "$live/utils/filesystem.ts";
import {
  DocNode,
  InterfaceDef,
  TsTypeDef,
  TsTypeDefLiteral,
  TsTypeLiteralDef,
  TsTypeRefDef,
  TsTypeUnionDef,
} from "https://deno.land/x/deno_doc@0.58.0/lib/types.d.ts";
import { JSONSchema7TypeName } from "https://esm.sh/@types/json-schema@7.0.11?pin=102";
import { crypto, toHashString } from "std/crypto/mod.ts";

export interface TransformContext {
  base: string;
  namespace: string;
}

export interface SchemeableBase {
  jsDocSchema?: JSONSchema7;
  friendlyId?: string;
  id?: string; // generated on-demand
  name?: string;
  file?: string;
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
  value: Schemeable;
}

export interface UnknownSchemable extends SchemeableBase {
  type: "unknown";
}
export interface SchemeableRef extends SchemeableBase {
  type: "ref";
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
  | SchemeableRef;

export const schemeableEqual = (a: Schemeable, b: Schemeable): boolean => {
  if (a.name !== b.name) {
    return false;
  }
  if (a.type !== b.type) {
    return false;
  }
  if (a.type === "array" && b.type === "array") {
    return schemeableEqual(a.value, b.value);
  }

  if (a.type === "unknown" && b.type === "unknown") {
    return true;
  }

  // TODO dumbway
  const aStr = JSON.stringify(a);
  const bStr = JSON.stringify(b);
  return aStr === bStr;
};

const schemeableWellKnownType = async (
  ref: TsTypeRefDef,
  root: [string, DocNode[]],
  seen: Map<DocNode, Schemeable>,
): Promise<Schemeable | undefined> => {
  switch (ref.typeName) {
    case "Partial": {
      if (ref.typeParams === null || (ref.typeParams?.length ?? 0) < 1) {
        return {
          type: "unknown",
        };
      }
      const schemeable = await tsTypeToSchemeableRec(
        ref.typeParams![0],
        root,
        seen,
      );
      if (schemeable.type !== "object") { // TODO(mcandeia) support arrays, unions and intersections
        return {
          type: "unknown",
        };
      }

      const newProperties: ObjectSchemeable["value"] = {};
      for (const [key, value] of Object.entries(schemeable.value)) {
        newProperties[key] = { ...value, required: false };
      }
      return {
        ...schemeable,
        value: newProperties,
        name: schemeable.name ? `partial${schemeable.name}` : undefined,
      };
    }
    case "Promise": {
      if (ref.typeParams === null || (ref.typeParams?.length ?? 0) < 1) {
        return {
          type: "unknown",
        };
      }
      return tsTypeToSchemeableRec(ref.typeParams![0], root, seen);
    }
    case "Pick": {
      if (
        ref.typeParams === null || (ref.typeParams?.length ?? 0) < 2
      ) {
        return {
          type: "unknown",
        };
      }
      const schemeable = await tsTypeToSchemeableRec(
        ref.typeParams![0],
        root,
        seen,
      );
      const keys = [];
      if (schemeable.type === "object") { // TODO(mcandeia) support arrays, unions and intersections
        const newValue: typeof schemeable["value"] = {};
        const pickKeys = ref.typeParams![1] as TsTypeUnionDef;
        if (pickKeys?.union) {
          for (const value of pickKeys?.union) {
            if (value.kind === "literal" && value.literal.kind === "string") {
              newValue[value.literal.string] = schemeable
                .value[value.literal.string];
              keys.push(value.literal.string);
            }
          }
        }
        const pickKeysAsLiteral = ref.typeParams![1] as TsTypeDefLiteral;
        if (
          pickKeysAsLiteral?.kind &&
          pickKeysAsLiteral?.literal?.kind === "string"
        ) {
          newValue[pickKeysAsLiteral.literal.string] = schemeable
            .value[pickKeysAsLiteral.literal.string];
          keys.push(pickKeysAsLiteral.literal.string);
        }
        schemeable.value = newValue;
      }
      keys.sort();
      return {
        ...schemeable,
        name: `pick${btoa(keys.join())}${schemeable.name}`,
      };
    }
    case "Omit": {
      if (
        ref.typeParams === null || (ref.typeParams?.length ?? 0) < 2
      ) {
        return {
          type: "unknown",
        };
      }
      const schemeable = await tsTypeToSchemeableRec(
        ref.typeParams![0],
        root,
        seen,
      );
      const keys: string[] = [];
      if (schemeable.type === "object") { // TODO(mcandeia) support arrays, unions and intersections
        const omitKeys = ref.typeParams![1] as TsTypeUnionDef;
        if (omitKeys?.union) {
          for (const value of omitKeys?.union) {
            if (value.kind === "literal" && value.literal.kind === "string") {
              delete (schemeable.value[value.literal.string]);
              keys.push(value.literal.string);
            }
          }
        }
        const omitKeysAsLiteral = ref.typeParams![1] as TsTypeDefLiteral;
        if (
          omitKeysAsLiteral?.kind &&
          omitKeysAsLiteral?.literal?.kind === "string"
        ) {
          delete (schemeable.value[omitKeysAsLiteral.literal.string]);
          keys.push(omitKeysAsLiteral.literal.string);
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
    case "LoaderReturnType": {
      if (ref.typeParams === null || (ref.typeParams?.length ?? 0) < 1) {
        return {
          type: "unknown",
        };
      }
      return tsTypeToSchemeableRec(ref.typeParams![0], root, seen);
    }
    case "Resolvable": {
      if (ref.typeParams === null || (ref.typeParams?.length ?? 0) < 1) {
        return {
          type: "inline",
          value: {
            $ref: "#/definitions/Resolvable",
          },
        };
      }
      const typeRef = ref.typeParams![0];
      if (typeRef.kind !== "typeRef") {
        return {
          type: "inline",
          value: {
            $ref: "#/definitions/Resolvable",
          },
        };
      }

      return tsTypeToSchemeableRec(typeRef, root, seen);
    }
    case "BlockInstance": {
      if ((ref.typeParams?.length ?? 0) < 1) {
        return undefined;
      }
      const configName = ref.typeParams![0];
      if (configName.kind !== "literal") {
        return undefined;
      }
      const literal = configName.literal;
      if (literal.kind !== "string") {
        return undefined;
      }
      return {
        type: "inline",
        value: {
          $ref: `#/definitions/${btoa(literal.string)}`,
        },
      };
    }
    case "InstanceOf": {
      if ((ref.typeParams?.length ?? 0) < 2) {
        return undefined;
      }
      const configName = ref.typeParams![1];
      if (configName.kind !== "literal") {
        return undefined;
      }
      const literal = configName.literal;
      if (literal.kind !== "string") {
        return undefined;
      }
      return {
        type: "inline",
        value: {
          $ref: literal[literal.kind] as string,
        },
      };
    }
    case "Response": {
      return {
        type: "inline",
        value: {
          $ref: "#/root/handlers",
        },
      };
    }
    case "PreactComponent": {
      if (ref.typeParams === null || (ref.typeParams?.length ?? 0) < 1) {
        return {
          type: "unknown",
        };
      }
      const typeRef = ref.typeParams![0];
      if (typeRef.kind !== "typeRef") {
        return {
          type: "unknown",
        };
      }

      return tsTypeToSchemeableRec(typeRef, root, seen);
    }
    case "Array": {
      if (ref.typeParams === null || (ref?.typeParams?.length ?? 0) < 1) {
        return {
          name: undefined,
          type: "array",
          value: {
            type: "unknown",
          },
        };
      }
      const typeSchemeable = await tsTypeToSchemeableRec(
        ref.typeParams![0],
        root,
        seen,
      );

      return {
        name: typeSchemeable.name ? `${typeSchemeable.name}[]` : undefined,
        type: "array",
        value: typeSchemeable,
      };
    }
    case "Record": {
      if (ref.typeParams?.length !== 2) {
        return {
          type: "unknown",
        };
      }

      const recordSchemeable = await tsTypeToSchemeableRec(
        ref.typeParams[1],
        root,
        seen,
      );

      return {
        file: recordSchemeable.file,
        name: recordSchemeable.name
          ? `${recordSchemeable.name}@record`
          : undefined,
        type: "record",
        value: recordSchemeable,
      };
    }
    default:
      return undefined;
  }
};

export const findSchemeableFromNode = async (
  rootNode: DocNode,
  root: [string, DocNode[]],
  seen: Map<DocNode, Schemeable>,
): Promise<Schemeable> => {
  const currLocation = {
    file: fromFileUrlOrNoop(rootNode.location.filename),
    name: rootNode.name,
  };
  const ref = {
    type: "ref",
    value: currLocation,
  } as SchemeableRef;
  const seenValue = seen.get(rootNode);
  if (seenValue !== undefined) {
    return seenValue;
  }
  seen.set(rootNode, ref);

  const resolve = async (): Promise<Schemeable> => {
    const kind = rootNode.kind;
    switch (kind) {
      case "interface": {
        const allOf = await Promise.all(
          rootNode.interfaceDef.extends.map(async (tp) => ({
            ...currLocation,
            ...await tsTypeToSchemeableRec(tp, root, seen),
          })),
        );
        return {
          ...currLocation,
          extends: allOf && allOf.length > 0 ? allOf : undefined,
          type: "object",
          ...(await typeDefToSchemeable(rootNode.interfaceDef, root, seen)),
          jsDocSchema: rootNode.jsDoc && jsDocToSchema(rootNode.jsDoc),
        };
      }
      case "typeAlias": {
        return {
          ...currLocation,
          ...(await tsTypeToSchemeableRec(
            rootNode.typeAliasDef.tsType,
            root,
            seen,
          )),
          jsDocSchema: rootNode.jsDoc && jsDocToSchema(rootNode.jsDoc),
        };
      }
      case "import": {
        const newRoots = await denoDoc(rootNode.importDef.src);
        const node = newRoots.find((n) => {
          return n.name === rootNode.importDef.imported;
        });
        if (!node) {
          return {
            name: rootNode.name,
            file: fromFileUrlOrNoop(rootNode.importDef.src),
            type: "unknown",
          };
        }
        return {
          ...currLocation,
          ...await findSchemeableFromNode(node, [
            rootNode.importDef.src,
            newRoots,
          ], seen),
        };
      }
    }
    return {
      ...currLocation,
      type: "unknown",
    };
  };
  const resolved = await resolve();
  ref.value = resolved;
  seen.delete(rootNode);
  return resolved;
};

const typeDefToSchemeable = async (
  node: InterfaceDef | TsTypeLiteralDef,
  root: [string, DocNode[]],
  seen: Map<DocNode, Schemeable>,
): Promise<Omit<ObjectSchemeable, "id" | "type">> => {
  const properties = await Promise.all(
    node.properties.map(async (property) => {
      const jsDocSchema =
        (property as InterfaceDef["properties"][number]).jsDoc &&
        jsDocToSchema((property as InterfaceDef["properties"][number]).jsDoc!);
      const schema = await tsTypeToSchemeableRec(
        property.tsType!,
        root,
        new Map(seen),
        property.optional,
      );

      return [
        property.name,
        {
          required: !property.optional,
          schemeable: schema,
          jsDocSchema: jsDocSchema,
          title: beautify(property.name),
        },
      ];
    }),
  );

  return {
    value: Object.fromEntries(properties),
  };
};
export const tsTypeToSchemeable = async (
  rootNode: DocNode,
  node: TsTypeDef,
  root: [string, DocNode[]],
  optional?: boolean,
): Promise<Schemeable> => {
  const seen = new Map();
  seen.set(rootNode, true);
  const resp = await tsTypeToSchemeableRec(node, root, seen, optional);
  seen.delete(rootNode);
  return resp;
};

const tsTypeToSchemeableRec = async (
  node: TsTypeDef,
  root: [string, DocNode[]],
  seen: Map<DocNode, Schemeable>,
  optional?: boolean,
): Promise<Schemeable> => {
  const kind = node.kind;
  switch (kind) {
    case "parenthesized": {
      return await tsTypeToSchemeableRec(node.parenthesized, root, seen);
    }
    case "indexedAccess": {
      const objSchemeable = await tsTypeToSchemeableRec(
        node.indexedAccess.objType,
        root,
        seen,
      );
      const indexType = node.indexedAccess.indexType;
      if (indexType.kind !== "literal") { // supporting only literal access A["b"]
        return {
          type: "unknown",
        };
      }
      if (
        objSchemeable.type === "object" && indexType.literal.kind === "string"
      ) {
        const { [indexType.literal.string]: prop } = objSchemeable.value;
        return {
          ...objSchemeable,
          name: objSchemeable.name
            ? `indexedAccess${indexType.literal.string}${objSchemeable.name}`
            : undefined,
          value: {
            [indexType.literal.string]: prop,
          },
        };
      }

      if (
        objSchemeable.type === "array" && indexType.literal.kind === "number"
      ) {
        const type = objSchemeable.value;
        return {
          ...type,
          name: type.name
            ? `indexedAccess${indexType.literal.number}${type.name}`
            : undefined,
        };
      }
      return {
        type: "unknown",
      };
    }
    case "array": {
      const typeSchemeable = await tsTypeToSchemeableRec(
        node.array,
        root,
        seen,
      );

      return {
        name: typeSchemeable.name ? `${typeSchemeable.name}[]` : undefined,
        file: typeSchemeable.file,
        type: "array",
        value: typeSchemeable,
      };
    }
    case "typeRef": {
      const wellknown = await schemeableWellKnownType(
        node.typeRef,
        root,
        seen,
      );
      if (wellknown) {
        return wellknown;
      }
      const rootNode = root[1].find((n) => {
        return n.name === node.typeRef.typeName;
      });
      if (!rootNode) {
        return {
          type: "unknown",
        };
      }
      return findSchemeableFromNode(rootNode, root, seen);
    }
    case "keyword": {
      if (node.keyword === "unknown") {
        return {
          type: "unknown",
        };
      }
      const keywordToType: Record<string, JSONSchema7Type> = {
        undefined: "null",
        any: "object",
      };
      const type = keywordToType[node.keyword] ?? node.keyword;
      return {
        type: "inline",
        value: type
          ? ({
            type: optional ? [type, "null"] : type,
          } as JSONSchema7)
          : {},
      };
    }
    case "typeLiteral":
      return {
        type: "object",
        ...(await typeDefToSchemeable(node.typeLiteral, root, seen)),
      };
    case "literal": {
      return {
        type: "inline",
        value: {
          type: node.literal.kind as JSONSchema7TypeName, // FIXME(mcandeia) not compliant with JSONSchema
          // deno-lint-ignore no-explicit-any
          const: (node.literal as any)[node.literal.kind],
        },
      };
    }
    case "intersection": {
      const values = await Promise.all(
        node.intersection.map((t) =>
          tsTypeToSchemeableRec(t, root, new Map(seen))
        ),
      );
      const ids = [];
      for (let i = 0; i < node.intersection.length; i++) {
        const tp = values[i];
        if (tp?.name) {
          ids.push(tp.name);
        } else if (tp && tp.type === "inline" && tp.value.type === "null") {
          ids.push("null");
        } else if (node.repr) {
          ids.push(node.repr);
        } else {
          const hash = await crypto.subtle.digest(
            "MD5",
            new TextEncoder().encode(JSON.stringify(tp)),
          );
          ids.push(toHashString(hash));
        }
      }
      ids.sort();
      const intersectionTypeId = ids.length === 0 ? undefined : ids.join("&");
      return {
        name: intersectionTypeId,
        file: values.find((v) => v.file)?.file,
        value: values,
        type: "intersection",
      };
    }
    case "union": {
      const values = await Promise.all(
        node.union.map((t) => tsTypeToSchemeableRec(t, root, new Map(seen))),
      );
      const ids = [];
      for (let i = 0; i < node.union.length; i++) {
        const tp = values[i];
        if (tp?.name) {
          ids.push(tp.name);
        } else if (tp && tp.type === "inline" && tp.value.type === "null") {
          ids.push("null");
        } else if (node.repr) {
          ids.push(node.repr);
        } else {
          const hash = await crypto.subtle.digest(
            "MD5",
            new TextEncoder().encode(JSON.stringify(tp)),
          );
          ids.push(toHashString(hash));
        }
      }
      ids.sort();
      const unionTypeId = ids.length === 0 ? undefined : ids.join("|");
      return {
        name: unionTypeId,
        file: values.find((v) => v.file)?.file,
        value: values,
        type: "union",
      };
    }
    case "fnOrConstructor":
    default:
      return {
        type: "unknown",
      };
  }
};
