import type { JSONSchema } from "$live/types.ts";
import type {
  ASTNode,
  ImportDefNode,
  InterfaceDefNode,
  JSDoc,
  Tag,
  TsType,
  TypeAliasDefNode,
  TypeDef,
  TypeRef,
} from "./ast.ts";

const exec = async (cmd: string[]) => {
  const process = Deno.run({ cmd, stdout: "piped" });

  const [stdout, status] = await Promise.all([
    process.output(),
    process.status(),
  ]);

  if (!status.success) {
    throw new Error(
      `Error while running ${cmd.join(" ")} with status ${status.code}`,
    );
  }

  process.close();

  return new TextDecoder().decode(stdout);
};

const denoDocCache = new Map<string, Promise<string>>();

export const denoDoc = async (path: string): Promise<ASTNode[]> => {
  const promise = denoDocCache.get(path) ??
    exec(["deno", "doc", "--json", path]);

  denoDocCache.set(path, promise);

  const stdout = await promise;
  return JSON.parse(stdout);
};

export const getSchemaId = async (schema: JSONSchema) => {
  const hashBuffer = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(JSON.stringify(schema)),
  );

  return Array.from(new Uint8Array(hashBuffer)).map((b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
};

const schemaForTSBuiltinType = async (node: TypeRef, root: ASTNode[]) => {
  switch (node.typeName) {
    case "Record": {
      if (node.typeParams?.length !== 2) {
        throw new Error("Built in type Record requires two parameters");
      }

      return {
        title: "Record",
        type: "object",
        additionalProperties: await tsTypeToSchema(node.typeParams[1], root),
      } as const;
    }

    case "Array": {
      if (node.typeParams?.length !== 1) {
        throw new Error("Built in type Array requires one parameter");
      }

      return {
        title: "Array",
        type: "array",
        items: await tsTypeToSchema(node.typeParams[0], root),
      } as const;
    }

    case "LoaderReturnType": {
      const typeDef = findType(node.typeName, root);
      const isLiveType = typeDef?.kind === "import" &&
        typeDef.importDef.src.endsWith("/types.ts");

      if (!isLiveType) {
        return;
      }

      const param = node.typeParams?.[0];

      if (!param) {
        throw new Error("Missing param for LoaderReturnType");
      }

      const transformed = await tsTypeToSchema(param, root);

      return {
        "$id": await getSchemaId(transformed),
        format: "live-function",
        type: "string" as const,
      };
    }
  }

  return null;
};

export const findType = (type: string, root: ASTNode[]) => {
  const node = root.find((
    node,
  ): node is InterfaceDefNode | TypeAliasDefNode | ImportDefNode =>
    node.name === type &&
    (node.kind === "interface" || node.kind === "typeAlias" ||
      node.kind === "import")
  );

  if (!node) {
    throw new Error(
      `Could not find type definition for ${type}. Are you exporting it?`,
    );
  }

  return node;
};

export const findExport = (name: string, root: ASTNode[]) => {
  const node = root.find((n) =>
    n.name === name && n.declarationKind === "export"
  );

  if (!node) {
    console.error(
      `Could not find export for ${name}. Are you exporting all necessary elements?`,
    );
  }

  return node;
};

/**
 * Some attriibutes are not string in JSON Schema. Because of that, we need to parse some to boolean or number.
 * For instance, maxLength and maxItems have to be parsed to number. readOnly should be a boolean etc
 */
const parseJSDocAttribute = (key: string, value: string) => {
  switch (key) {
    case "maximum":
    case "exclusiveMaximum":
    case "minimum":
    case "exclusiveMinimum":
    case "maxLength":
    case "minLength":
    case "multipleOf":
    case "maxItems":
    case "minItems":
    case "maxProperties":
    case "minProperties":
      return Number(value);
    case "readOnly":
    case "writeOnly":
    case "uniqueItems":
      return Boolean(value);
    default:
      return value;
  }
};

const jsDocToSchema = (node: JSDoc) =>
  node.tags
    ? Object.fromEntries(
      node.tags
        .map((tag: Tag) => {
          const match = tag.value.match(/^@(?<key>[a-zA-Z]+) (?<value>.*)$/);

          const key = match?.groups?.key;
          const value = match?.groups?.value;

          if (typeof key === "string" && typeof value === "string") {
            const parsedValue = parseJSDocAttribute(key, value);
            return [key, parsedValue] as const;
          }

          return null;
        })
        .filter((e): e is [string, string | number | boolean] => !!e),
    )
    : undefined;

const typeDefToSchema = async (
  node: TypeDef,
  root: ASTNode[],
): Promise<JSONSchema> => {
  const properties = await Promise.all(
    node.properties.map(async (property) => {
      const jsDocSchema = property.jsDoc && jsDocToSchema(property.jsDoc);
      const schema = await tsTypeToSchema(
        property.tsType,
        root,
        property.optional,
      );

      return [property.name, {
        ...schema,
        title: beautify(property.name),
        ...jsDocSchema,
      }] as const;
    }),
  );

  const required = node.properties.filter((p) => !p.optional).map((p) =>
    p.name
  );

  return {
    title: node.name,
    type: "object",
    properties: Object.fromEntries(properties),
    required,
  };
};

export const tsTypeToSchema = async (
  node: TsType,
  root: ASTNode[],
  optional?: boolean,
): Promise<JSONSchema> => {
  const kind = node.kind;

  switch (kind) {
    case "typeRef": {
      const maybeSchema = await schemaForTSBuiltinType(node.typeRef, root);

      if (maybeSchema) {
        return maybeSchema;
      }

      const r = findType(node.typeRef.typeName, root);

      const schema = await docToSchema(r, root);

      return {
        ...schema,
        title: schema.title || node.repr,
      };
    }
    case "indexedAccess":
      throw new Error("Not Implemented");

    case "keyword": {
      return {
        type: optional ? [node.keyword, "null"] : node.keyword,
      };
    }

    case "typeLiteral": {
      return await typeDefToSchema(node.typeLiteral, root);
    }

    case "union": {
      const children = await Promise.all(
        node.union.map((n) => tsTypeToSchema(n, root)),
      );

      return {
        type: children[0].type,
        anyOf: children,
      };
    }

    case "array": {
      return {
        type: "array",
        items: await tsTypeToSchema(node.array, root),
      };
    }

    case "literal": {
      return {
        type: node.literal.kind,
        const: node.literal[node.literal.kind],
      };
    }

    default:
      throw new Error(`Unknown kind ${kind}`);
  }
};

const docToSchema = async (
  node: ASTNode,
  root: ASTNode[],
): Promise<JSONSchema> => {
  const kind = node.kind;

  switch (kind) {
    case "import":
      return tsToSchema(node.importDef.src, node.importDef.imported);

    case "interface":
      return typeDefToSchema(node.interfaceDef, root);

    case "typeAlias": {
      const jsDocSchema = node.jsDoc && jsDocToSchema(node.jsDoc);
      const schema = await tsTypeToSchema(
        node.typeAliasDef.tsType,
        root,
      );

      return {
        ...jsDocSchema,
        ...schema,
      };
    }

    case "variable":
      throw new Error("Not Implemented");

    case "function":
      throw new Error("Not Implemented");

    default:
      throw new Error(`Unknown kind ${kind}`);
  }
};

export const tsToSchema = async (path: string, type: string) => {
  const nodes = await denoDoc(path);
  const node = findType(type, nodes);
  return docToSchema(node, nodes);
};

/**
 * Transforms myPropName into "My Prop Name" for cases
 * when there's no label specified
 *
 * TODO: Support i18n in the future
 */
export const beautify = (propName: string) => {
  return (
    propName
      // insert a space before all caps
      .replace(/([A-Z])/g, " $1")
      // uppercase the first character
      .replace(/^./, function (str) {
        return str.toUpperCase();
      })
      // Remove startsWith("/"")
      .replace(/^\//, "")
      // Remove endsdWith('.ts' or '.tsx')
      .replace(/\.tsx?$/, "")
  );
};
