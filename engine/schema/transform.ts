import { ASTNode, TsType, TypeDef, TypeRef } from "$live/engine/schema/ast.ts";
import { beautify, jsDocToSchema } from "$live/engine/schema/utils.ts";
import { fromFileUrl } from "https://deno.land/std@0.170.0/path/mod.ts";
import { JSONSchema7 } from "https://esm.sh/@types/json-schema@7.0.11?pin=102";
import { ModuleAST } from "../block.ts";
import { notUndefined } from "$live/engine/core/utils.ts";

export interface TransformContext {
  base: string;
  code: Record<string, ModuleAST>;
  denoDoc: (src: string) => Promise<ModuleAST>;
}

export const inlineOrSchemeable = async (
  transformContext: TransformContext,
  ast: [string, ASTNode[]],
  tp: TsType | JSONSchema7 | undefined
): Promise<Schemeable | undefined> => {
  if ((tp as TsType).repr !== undefined) {
    return await tsTypeToSchemeable(transformContext, tp as TsType, ast);
  } else if (tp !== undefined) {
    return {
      type: "inline",
      value: tp as JSONSchema7,
    };
  }
  return undefined;
};

export interface SchemeableBase {
  id?: string;
  root?: string;
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
    { title: string; schemeable: Schemeable; jsDocSchema: JSONSchema7 }
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
  if (a.id !== b.id) {
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
  transformContext: TransformContext,
  ref: TypeRef,
  root: ASTNode[]
): Promise<Schemeable | undefined> => {
  switch (ref.typeName) {
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

      return tsTypeToSchemeableRec(transformContext, ref.typeParams![0], root);
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

      return tsTypeToSchemeableRec(transformContext, ref.typeParams![0], root);
    }
    case "Array": {
      if (ref.typeParams === null || (ref?.typeParams?.length ?? 0) < 1) {
        return {
          id: "./unknown[]",
          type: "array",
          value: {
            type: "unknown",
          },
        };
      }
      const typeSchemeable = await tsTypeToSchemeableRec(
        transformContext,
        ref.typeParams![0],
        root
      );

      return {
        id: `${typeSchemeable.id}[]`,
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
        transformContext,
        ref.typeParams[1],
        root
      );

      return {
        id: `./record<string, ${
          recordSchemeable.id ?? ref.typeParams[1].repr
        }>`,
        type: "record",
        value: recordSchemeable,
      };
    }
    default:
      return undefined;
  }
};

const findSchemeableFromNode = async (
  transformContext: TransformContext,
  rootNode: ASTNode,
  root: ASTNode[]
): Promise<Schemeable> => {
  const kind = rootNode.kind;
  switch (kind) {
    case "interface": {
      const allOf = await Promise.all(
        rootNode.interfaceDef.extends.map((tp) =>
          tsTypeToSchemeableRec(transformContext, tp, root)
        )
      );
      const fileName = rootNode.location.filename.startsWith("file://")
        ? fromFileUrl(rootNode.location.filename)
        : rootNode.location.filename;
      return {
        id: `${fileName.replaceAll(transformContext.base, ".")}@${
          rootNode.name
        }`,
        extends: allOf,
        type: "object",
        ...(await typeDefToSchemeable(
          transformContext,
          rootNode.interfaceDef,
          root
        )),
      };
    }
    case "typeAlias": {
      return tsTypeToSchemeableRec(
        transformContext,
        rootNode.typeAliasDef.tsType,
        root
      );
    }
    case "import": {
      const fileName = rootNode.importDef.src.startsWith("file://")
        ? fromFileUrl(rootNode.importDef.src)
        : rootNode.importDef.src;
      const newRoots = (await transformContext.denoDoc(fileName))[2];
      const node = newRoots.find((n) => {
        return n.name === rootNode.importDef.imported;
      });
      if (!node) {
        return {
          type: "unknown",
        };
      }
      return findSchemeableFromNode(transformContext, node, newRoots);
    }
  }
  return {
    type: "unknown",
  };
};

const typeDefToSchemeable = async (
  transformContext: TransformContext,
  node: TypeDef,
  root: ASTNode[]
): Promise<Omit<ObjectSchemeable, "id" | "type">> => {
  const properties = await Promise.all(
    node.properties.map(async (property) => {
      const jsDocSchema = property.jsDoc && jsDocToSchema(property.jsDoc);
      const schema = await tsTypeToSchemeableRec(
        transformContext,
        property.tsType,
        root,
        property.optional
      );

      return [
        property.name,
        {
          schemeable: schema,
          jsDocSchema: jsDocSchema,
          title: beautify(property.name),
        },
      ];
    })
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
  transformContext: TransformContext,
  node: TsType,
  root: [string, ASTNode[]],
  optional?: boolean
): Promise<Schemeable> => {
  const schemeable = await tsTypeToSchemeableRec(
    transformContext,
    node,
    root[1],
    optional
  );
  return {
    ...schemeable,
    id: schemeable.id ?? `${root[0]}@${crypto.randomUUID()}`,
  };
};

const tsTypeToSchemeableRec = async (
  transformContext: TransformContext,
  node: TsType,
  root: ASTNode[],
  optional?: boolean
): Promise<Schemeable> => {
  const kind = node.kind;
  switch (kind) {
    case "array": {
      const typeSchemeable = await tsTypeToSchemeableRec(
        transformContext,
        node.array,
        root
      );

      return {
        id: typeSchemeable.id ? `${typeSchemeable.id}[]` : undefined,
        type: "array",
        value: typeSchemeable,
      };
    }
    case "typeRef": {
      const wellknown = await schemeableWellKnownType(
        transformContext,
        node.typeRef,
        root
      );
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
      return await findSchemeableFromNode(transformContext, rootNode, root);
    }
    case "keyword": {
      if (node.keyword === "unknown") {
        return {
          type: "unknown",
        };
      }
      return {
        type: "inline",
        value: {
          type: optional ? [node.keyword, "null"] : node.keyword,
        },
      };
    }
    case "typeLiteral":
      return {
        type: "object",
        ...(await typeDefToSchemeable(
          transformContext,
          node.typeLiteral,
          root
        )),
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
        node.union.map((t) => tsTypeToSchemeableRec(transformContext, t, root))
      );
      const ids = values.map((tp) => tp.id).filter(notUndefined);
      ids.sort();
      const unionTypeId =
        ids.length !== node.union.length ? undefined : ids.join("|");
      return {
        id: unionTypeId,
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
