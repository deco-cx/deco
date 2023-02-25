import { ASTNode, TsType, TypeDef, TypeRef } from "$live/engine/schema/ast.ts";
import { beautify, jsDocToSchema } from "$live/engine/schema/transform.ts";
import { fromFileUrl } from "https://deno.land/std@0.170.0/path/mod.ts";
import * as J from "https://deno.land/x/fun@v2.0.0-alpha.10/json_schema.ts";
import { Type } from "https://deno.land/x/jsonschema@v1.4.1/types.ts";
import { JSONSchema7 } from "https://esm.sh/@types/json-schema@7.0.11?pin=102";
import { ModuleAST } from "../block.ts";

export interface TransformContext {
  base: string;
  code: Record<string, ModuleAST>;
}

export const inlineOrSchemeable = (
  transformContext: TransformContext,
  ast: ASTNode[],
  tp: TsType | JSONSchema7 | undefined,
): Schemeable | undefined => {
  if ((tp as TsType).repr !== undefined) {
    return tsTypeToSchemeable(transformContext, tp as TsType, ast);
  } else if (tp !== undefined) {
    const inlineValue: J.JsonBuilder<unknown> = () => [tp as Type, {}];
    return {
      type: "inline",
      value: inlineValue,
    };
  }
  return undefined;
};

export interface SchemeableBase {
  id?: string;
}
export interface InlineSchemeable extends SchemeableBase {
  type: "inline";
  value: J.JsonBuilder<unknown>;
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
  if (a.type === "inline" && b.type === "inline") {
    return J.print(a.value) === J.print(b.value);
  }

  if (a.type === "unknown" && b.type === "unknown") {
    return true;
  }

  // TODO dumbway
  const aStr = JSON.stringify(a);
  const bStr = JSON.stringify(b);
  return aStr === bStr;
};
const schemeableWellKnownType = (
  transformContext: TransformContext,
  ref: TypeRef,
  root: ASTNode[],
): Schemeable | undefined => {
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

      const v: J.JsonBuilder<unknown> = () => [
        {
          $ref,
        },
        {},
      ];
      return {
        type: "inline",
        value: v,
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
      const typeSchemeable = tsTypeToSchemeable(
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

      const recordSchemeable = tsTypeToSchemeable(
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

const findSchemeableFromNode = (
  transformContext: TransformContext,
  rootNode: ASTNode,
  root: ASTNode[],
): Schemeable => {
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
        ...typeDefToSchemeable(transformContext, rootNode.interfaceDef, root),
      };
    }
    case "typeAlias": {
      return tsTypeToSchemeable(
        transformContext,
        rootNode.typeAliasDef.tsType,
        root,
      );
    }
    case "import": {
      const newRoots =
        transformContext.code[fromFileUrl(rootNode.importDef.src)][2];
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

const typeDefToSchemeable = (
  transformContext: TransformContext,
  node: TypeDef,
  root: ASTNode[],
): Omit<ObjectSchemeable, "id" | "type"> => {
  const properties = node.properties.map((property) => {
    const jsDocSchema = property.jsDoc && jsDocToSchema(property.jsDoc);
    const schema = tsTypeToSchemeable(
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
  });

  const required = node.properties
    .filter((p) => !p.optional)
    .map((p) => p.name);

  return {
    title: node.name,
    value: Object.fromEntries(properties),
    required,
  };
};
export const tsTypeToSchemeable = (
  transformContext: TransformContext,
  node: TsType,
  root: ASTNode[],
  optional?: boolean,
): Schemeable => {
  const kind = node.kind;

  switch (kind) {
    case "array": {
      const typeSchemeable = tsTypeToSchemeable(
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
      const wellknown = schemeableWellKnownType(
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
      return findSchemeableFromNode(transformContext, rootNode, root);
    }
    case "keyword": {
      const byKeyword = {
        string: J.string(),
        number: J.number(),
        boolean: J.boolean(),
        unknown: J.unknown(),
      };
      return {
        type: "inline",
        value: optional
          ? J.nullable(byKeyword[node.keyword])
          : byKeyword[node.keyword],
      };
    }
    case "typeLiteral":
      return {
        type: "object",
        ...typeDefToSchemeable(transformContext, node.typeLiteral, root),
      };
    case "literal": {
      return {
        type: "inline",
        value: J.literal(node.literal[node.literal.kind]),
      };
    }
    case "union": {
      const values = node.union.map((t) =>
        tsTypeToSchemeable(transformContext, t, root)
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
