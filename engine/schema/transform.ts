import { ASTNode, TsType, TypeDef, TypeRef } from "$live/engine/schema/ast.ts";
import { beautify, jsDocToSchema } from "$live/engine/schema/utils.ts";
import { fromFileUrl } from "https://deno.land/std@0.170.0/path/mod.ts";
import { JSONSchema7 } from "https://esm.sh/@types/json-schema@7.0.11?pin=102";
import { ModuleAST } from "../block.ts";

export interface TransformContext {
  base: string;
  code: Record<string, ModuleAST>;
  denoDoc: (src: string) => Promise<ModuleAST>;
}

export const inlineOrSchemeable = async (
  transformContext: TransformContext,
  ast: [string, ASTNode[]],
  tp: TsType | JSONSchema7 | undefined,
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
}
export interface InlineSchemeable extends SchemeableBase {
  type: "inline";
  value: JSONSchema7;
}
export interface ObjectSchemeable extends SchemeableBase {
  type: "object";
  title: string;
  value: Record<
    string,
    { title: string; schemeable: Schemeable; jsDocSchema: JSONSchema7 }
  >;
  required: string[];
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
  root: ASTNode[],
): Promise<Schemeable | undefined> => {
  switch (ref.typeName) {
    case "PreactComponent": {
      if (ref.typeParams && ref.typeParams.length < 1) {
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

      const def: Record<string, string> = {
        Section: "#/definitions/$live/blocks/section.ts#Section",
        Page: "#/definitions/$live/blocks/page.ts#Page",
      };
      const $ref = def[typeRef.typeRef.typeName];
      if (!$ref) {
        return {
          type: "unknown",
        };
      }

      return {
        type: "inline",
        value: {
          $ref,
        },
      };
    }
    case "Array": {
      if (ref.typeParams && ref.typeParams.length < 1) {
        return {
          id: "unknown[]",
          type: "array",
          value: {
            type: "unknown",
          },
        };
      }
      const typeSchemeable = await tsTypeToSchemeableRec(
        transformContext,
        ref.typeParams![0],
        root,
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
        root,
      );

      return {
        id: `record<?, ${recordSchemeable.id}>`,
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
  root: ASTNode[],
): Promise<Schemeable> => {
  const kind = rootNode.kind;
  switch (kind) {
    case "interface": {
      return {
        id: `${
          fromFileUrl(rootNode.location.filename).replaceAll(
            transformContext.base,
            ".",
          )
        }@${rootNode.name}`,
        type: "object",
        ...(await typeDefToSchemeable(
          transformContext,
          rootNode.interfaceDef,
          root,
        )),
      };
    }
    case "typeAlias": {
      return tsTypeToSchemeableRec(
        transformContext,
        rootNode.typeAliasDef.tsType,
        root,
      );
    }
    case "import": {
      const newRoots = (
        await transformContext.denoDoc(fromFileUrl(rootNode.importDef.src))
      )[2];
      const node = newRoots.find((n) => {
        return n.name === rootNode.importDef.imported;
      });
      if (!node) {
        return {
          type: "unknown",
        };
      }
      return findSchemeableFromNode(transformContext, node, root);
    }
  }
  return {
    type: "unknown",
  };
};

const typeDefToSchemeable = async (
  transformContext: TransformContext,
  node: TypeDef,
  root: ASTNode[],
): Promise<Omit<ObjectSchemeable, "id" | "type">> => {
  const properties = await Promise.all(
    node.properties.map(async (property) => {
      const jsDocSchema = property.jsDoc && jsDocToSchema(property.jsDoc);
      const schema = await tsTypeToSchemeableRec(
        transformContext,
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
  transformContext: TransformContext,
  node: TsType,
  root: [string, ASTNode[]],
  optional?: boolean,
): Promise<Schemeable> => {
  const schemeable = await tsTypeToSchemeableRec(
    transformContext,
    node,
    root[1],
    optional,
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
  optional?: boolean,
): Promise<Schemeable> => {
  const kind = node.kind;

  switch (kind) {
    case "array": {
      const typeSchemeable = await tsTypeToSchemeableRec(
        transformContext,
        node.array,
        root,
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
        root,
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
          root,
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
        node.union.map((t) => tsTypeToSchemeableRec(transformContext, t, root)),
      );
      const ids = values.map((tp) => tp.id);
      ids.sort();
      const unionTypeId = ids.join("|");
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
