import { ASTNode, TsType, TypeDef, TypeRef } from "$live/engine/schema/ast.ts";
import {
  beautify,
  denoDoc,
  jsDocToSchema,
} from "$live/engine/schema/transform.ts";
import * as J from "https://deno.land/x/jsonschema@v1.4.1/jsonschema.ts";
import { JSONSchema7 } from "https://esm.sh/@types/json-schema@7.0.11?pin=102";

export interface SchemeableBase {
  id?: string;
}
export interface InlineSchemeable extends SchemeableBase {
  type: "inline";
  value: J.JsonSchema<unknown>;
}
export interface TypeDefSchemeable extends SchemeableBase {
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
  | TypeDefSchemeable
  | UnionSchemeable
  | ArraySchemeable
  | InlineSchemeable
  | RecordSchemeable
  | UnknownSchemable;

const schemeableWellKnownType = async (
  pathBase: string,
  ref: TypeRef,
  root: ASTNode[]
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

      const v: J.JsonSchema<unknown> = () => [
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
      const typeSchemeable = await tsTypeToSchemeable(
        pathBase,
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

      const recordSchemeable = await tsTypeToSchemeable(
        pathBase,
        ref.typeParams[1],
        root
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
  pathBase: string,
  rootNode: ASTNode,
  root: ASTNode[]
): Promise<Schemeable> => {
  const kind = rootNode.kind;
  switch (kind) {
    case "interface": {
      return {
        id: `${rootNode.location.filename.replaceAll(pathBase, ".")}@${
          rootNode.name
        }`,
        type: "object",
        ...(await typeDefToSchemeable(pathBase, rootNode.interfaceDef, root)),
      };
    }
    case "typeAlias": {
      return tsTypeToSchemeable(pathBase, rootNode.typeAliasDef.tsType, root);
    }
    case "import": {
      const newRoots = await denoDoc(rootNode.importDef.src);
      const node = newRoots.find((n: ASTNode) => {
        return n.name === rootNode.importDef.imported;
      });
      if (!node) {
        return {
          type: "unknown",
        };
      }
      return findSchemeableFromNode(pathBase, node, root);
    }
  }
  return {
    type: "unknown",
  };
};

const typeDefToSchemeable = async (
  pathBase: string,
  node: TypeDef,
  root: ASTNode[]
): Promise<Omit<TypeDefSchemeable, "id" | "type">> => {
  const properties = await Promise.all(
    node.properties.map(async (property) => {
      const jsDocSchema = property.jsDoc && jsDocToSchema(property.jsDoc);
      const schema = await tsTypeToSchemeable(
        pathBase,
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
  pathBase: string,
  node: TsType,
  root: ASTNode[],
  optional?: boolean
): Promise<Schemeable> => {
  const kind = node.kind;

  switch (kind) {
    case "array": {
      const typeSchemeable = await tsTypeToSchemeable(
        pathBase,
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
        pathBase,
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
      return findSchemeableFromNode(pathBase, rootNode, root);
    }
    case "keyword": {
      const byKeyword = {
        string: J.string,
        number: J.number,
        boolean: J.boolean,
        unknown: J.unknown,
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
        ...(await typeDefToSchemeable(pathBase, node.typeLiteral, root)),
      };
    case "literal": {
      return {
        type: "inline",
        value: J.literal(node.literal[node.literal.kind]),
      };
    }
    case "union": {
      const values = await Promise.all(
        node.union.map((t) => tsTypeToSchemeable(pathBase, t, root))
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
