import { notUndefined } from "$live/engine/core/utils.ts";
import { ASTNode, TsType, TypeDef, TypeRef } from "$live/engine/schema/ast.ts";
import { beautify, denoDoc, jsDocToSchema } from "$live/engine/schema/utils.ts";
import { JSONSchema7, JSONSchema7Type } from "$live/deps.ts";
import { ModuleAST } from "$live/engine/block.ts";

export interface TransformContext {
  base: string;
  code: Record<string, ModuleAST>;
  namespace: string;
}

export const inlineOrSchemeable = async (
  ast: [string, ASTNode[]],
  tp: TsType | JSONSchema7 | undefined,
): Promise<Schemeable | undefined> => {
  if ((tp as TsType).repr !== undefined) {
    return await tsTypeToSchemeable(tp as TsType, ast);
  } else if (tp !== undefined) {
    return {
      type: "inline",
      value: tp as JSONSchema7,
    };
  }
  return undefined;
};

export interface SchemeableBase {
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
    { title?: string; schemeable: Schemeable; jsDocSchema?: JSONSchema7 }
  >;
  required?: string[];
}

export interface RecordSchemeable extends SchemeableBase {
  type: "record";
  value: Schemeable;
}

export interface UnionSchemeable extends SchemeableBase {
  type: "union";
  value: Schemeable[];
}

export interface ArraySchemeable extends SchemeableBase {
  type: "array";
  value: Schemeable;
}

export interface UnknownSchemable extends SchemeableBase {
  type: "unknown";
}

export type Schemeable =
  | ObjectSchemeable
  | UnionSchemeable
  | ArraySchemeable
  | InlineSchemeable
  | RecordSchemeable
  | UnknownSchemable;

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
  ref: TypeRef,
  root: ASTNode[],
): Promise<Schemeable | undefined> => {
  switch (ref.typeName) {
    case "Promise": {
      if (ref.typeParams === null || (ref.typeParams?.length ?? 0) < 1) {
        return {
          type: "unknown",
        };
      }
      return tsTypeToSchemeableRec(ref.typeParams![0], root);
    }
    case "LoaderReturnType": {
      if (ref.typeParams === null || (ref.typeParams?.length ?? 0) < 1) {
        return {
          type: "unknown",
        };
      }
      return tsTypeToSchemeableRec(ref.typeParams![0], root);
    }
    case "Resolvable": {
      if (ref.typeParams === null || (ref.typeParams?.length ?? 0) < 1) {
        return {
          type: "inline",
          value: {
            $ref: "#/root/state",
          },
        };
      }
      const typeRef = ref.typeParams![0];
      if (typeRef.kind !== "typeRef") {
        return {
          type: "inline",
          value: {
            $ref: "#/root/state",
          },
        };
      }

      return tsTypeToSchemeableRec(typeRef, root);
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

      return tsTypeToSchemeableRec(typeRef, root);
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
      );

      return {
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
  rootNode: ASTNode,
  root: ASTNode[],
): Promise<Schemeable> => {
  const kind = rootNode.kind;
  switch (kind) {
    case "interface": {
      const allOf = await Promise.all(
        rootNode.interfaceDef.extends.map((tp) =>
          tsTypeToSchemeableRec(tp, root)
        ),
      );
      return {
        name: rootNode.name,
        file: rootNode.location.filename,
        extends: allOf,
        type: "object",
        ...(await typeDefToSchemeable(rootNode.interfaceDef, root)),
      };
    }
    case "typeAlias": {
      return {
        name: rootNode.name,
        file: rootNode.location.filename,
        ...(await tsTypeToSchemeableRec(rootNode.typeAliasDef.tsType, root)),
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
          file: rootNode.importDef.src,
          type: "unknown",
        };
      }
      return findSchemeableFromNode(node, newRoots);
    }
  }
  return {
    name: rootNode.name,
    file: rootNode.location.filename,
    type: "unknown",
  };
};

const typeDefToSchemeable = async (
  node: TypeDef,
  root: ASTNode[],
): Promise<Omit<ObjectSchemeable, "id" | "type">> => {
  const properties = await Promise.all(
    node.properties.map(async (property) => {
      const jsDocSchema = property.jsDoc && jsDocToSchema(property.jsDoc);
      const schema = await tsTypeToSchemeableRec(
        property.tsType,
        root,
        property.optional,
      );

      return [
        property.name,
        {
          schemeable: schema,
          jsDocSchema: jsDocSchema,
          title: beautify(property.name),
        },
      ];
    }),
  );

  const required = node.properties
    .filter((p) => !p.optional)
    .map((p) => p.name);

  return {
    title: node.name,
    value: Object.fromEntries(properties),
    required,
  };
};
export const tsTypeToSchemeable = async (
  node: TsType,
  root: [string, ASTNode[]],
  optional?: boolean,
): Promise<Schemeable> => {
  const schemeable = await tsTypeToSchemeableRec(node, root[1], optional);
  return {
    ...schemeable,
    name: schemeable.name ?? crypto.randomUUID(),
    file: schemeable.file ?? root[0],
  };
};

const tsTypeToSchemeableRec = async (
  node: TsType,
  root: ASTNode[],
  optional?: boolean,
): Promise<Schemeable> => {
  const kind = node.kind;
  switch (kind) {
    case "array": {
      const typeSchemeable = await tsTypeToSchemeableRec(node.array, root);

      return {
        name: typeSchemeable.name ? `${typeSchemeable.name}[]` : undefined,
        file: typeSchemeable.file,
        type: "array",
        value: typeSchemeable,
      };
    }
    case "typeRef": {
      const wellknown = await schemeableWellKnownType(node.typeRef, root);
      if (wellknown) {
        return wellknown;
      }
      const rootNode = root.find((n) => {
        return n.name === node.typeRef.typeName;
      });
      if (!rootNode) {
        return {
          type: "unknown",
        };
      }
      return await findSchemeableFromNode(rootNode, root);
    }
    case "keyword": {
      if (node.keyword === "unknown") {
        return {
          type: "unknown",
        };
      }
      const keywordToType: Record<string, JSONSchema7Type> = {
        undefined: "null",
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
        ...(await typeDefToSchemeable(node.typeLiteral, root)),
      };
    case "literal": {
      return {
        type: "inline",
        value: {
          type: node.literal.kind,
          const: node.literal[node.literal.kind],
        },
      };
    }
    case "union": {
      const values = await Promise.all(
        node.union.map((t) => tsTypeToSchemeableRec(t, root)),
      );
      const ids = values.map((tp) => tp.name).filter(notUndefined);
      ids.sort();
      const unionTypeId = ids.length !== node.union.length
        ? undefined
        : ids.join("|");
      return {
        name: unionTypeId,
        file: values[0]?.file,
        value: values,
        type: "union",
      };
    }
    case "fnOrConstructor":
    case "indexedAccess":
    default:
      return {
        type: "unknown",
      };
  }
};
