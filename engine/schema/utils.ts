import { fromFileUrl } from "https://deno.land/std@0.61.0/path/mod.ts";
import type { JSONSchema7 as Schema } from "json-schema";
import { notUndefined } from "../core/utils.ts";
import {
  ASTNode,
  FunctionDefNode,
  JSDoc,
  Tag,
  TsType,
  TsTypeFnOrConstructor,
} from "./ast.ts";
import { TransformContext } from "./transform.ts";

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

export const jsDocToSchema = (node: JSDoc) =>
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
          .filter((e): e is [string, string | number | boolean] => !!e)
      )
    : undefined;

export const findExport = (name: string, root: ASTNode[]) => {
  const node = root.find(
    (n) => n.name === name && n.declarationKind === "export"
  );

  if (!node) {
    console.error(
      `Could not find export for ${name}. Are you exporting all necessary elements?`
    );
  }

  return node;
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
const denoDocCache = new Map<string, Promise<string>>();

const exec = async (cmd: string[]) => {
  const process = Deno.run({ cmd, stdout: "piped", stderr: "piped" });

  const [stdout, status] = await Promise.all([
    process.output(),
    process.status(),
  ]);

  if (!status.success) {
    throw new Error(
      `Error while running ${cmd.join(" ")} with status ${status.code}`
    );
  }

  process.close();

  return new TextDecoder().decode(stdout);
};

export const denoDoc = async (path: string): Promise<ASTNode[]> => {
  const promise =
    denoDocCache.get(path) ?? exec(["deno", "doc", "--json", path]);

  denoDocCache.set(path, promise);
  const stdout = await promise;
  return JSON.parse(stdout);
};

// TODO: Should we extract defaultProps from the schema here?
export const generatePropsForSchema = (schema: Schema | null | undefined) => {
  if (schema?.type == null || Array.isArray(schema.type)) {
    return null;
  }

  const cases: Record<string, unknown> = {
    object: {},
    array: [],
    boolean: true,
    number: 0,
    integer: 0,
    null: null,
  };

  return cases[schema.type] ?? null;
};

export interface TypeRef {
  typeName: string;
  importUrl: string;
}

export const isFunctionDef = (node: ASTNode): node is FunctionDefNode => {
  return node.kind === "function";
};

const extendsTypeFromNode = async (
  transformContext: TransformContext,
  rootNode: ASTNode,
  type: string
): Promise<boolean> => {
  if (rootNode.kind === "interface") {
    return (
      rootNode.interfaceDef.extends.find(
        (n) => n.kind === "typeRef" && n.typeRef.typeName === type
      ) !== undefined
    );
  }
  if (rootNode.kind !== "import") {
    return false;
  }
  const newRoots = (
    await transformContext.denoDoc(fromFileUrl(rootNode.importDef.src))
  )[2];
  const node = newRoots.find((n: ASTNode) => {
    return n.name === rootNode.importDef.imported;
  });
  if (!node) {
    return false;
  }
  return extendsTypeFromNode(transformContext, node, type);
};

export const extendsType = async (
  transformContext: TransformContext,
  tsType: TsType,
  root: ASTNode[],
  type: string
): Promise<boolean> => {
  if (tsType?.kind !== "typeRef") {
    return false;
  }
  const rootNode = root.find((n) => {
    return n.name === tsType.typeRef.typeName;
  });
  if (!rootNode) {
    return false;
  }
  return await extendsTypeFromNode(transformContext, rootNode, type);
};

const isFunctionDefOfReturn = async (
  transformContext: TransformContext,
  originalName: string,
  root: ASTNode[],
  returnRef: string,
  node: ASTNode
): Promise<boolean> => {
  return (
    isFunctionDef(node) &&
    node.declarationKind === "export" &&
    ((node.functionDef?.returnType !== null &&
      node.functionDef.returnType.repr === returnRef) ||
      (node.functionDef?.returnType !== null &&
        (await extendsType(
          transformContext,
          node.functionDef.returnType,
          root,
          originalName
        ))))
  );
};

export interface FunctionTypeDef {
  name: string;
  params: TsType[];
  return: TsType;
}

export const isFnOrConstructor = (
  tsType: TsType
): tsType is TsTypeFnOrConstructor => {
  return tsType.kind === "fnOrConstructor";
};

const findImportAliasOrName = (
  { typeName, importUrl }: TypeRef,
  asts: ASTNode[]
): ASTNode | undefined => {
  return asts.find((ast) => {
    return (
      ast.kind === "import" &&
      ast.importDef.src === importUrl &&
      ast.importDef.imported === typeName
    );
  });
};

export const findAllExtends = (
  { typeName, importUrl }: TypeRef,
  asts: ASTNode[]
): TsType[] => {
  const importNode = findImportAliasOrName({ typeName, importUrl }, asts);
  if (importNode === undefined) {
    return [];
  }

  const possibilities = asts.filter((ast) => {
    // TODO does not consider extends of extends.
    return (
      ast.kind === "interface" &&
      ast.interfaceDef.extends.find((e) => e.repr === importNode.name)
    );
  });

  return possibilities.map((ast) => {
    return {
      repr: ast.name,
      kind: "typeRef",
      typeRef: {
        typeParams: null,
        typeName: ast.name,
      },
    };
  });
};

export const fnDefinitionRoot = async (
  ctx: TransformContext,
  node: ASTNode,
  currRoot: [string, ASTNode[]]
): Promise<[FunctionTypeDef | undefined, [string, ASTNode[]]]> => {
  const fn = nodeToFunctionDefinition(node);
  if (!fn) {
    return [undefined, currRoot];
  }
  const fileName = node.location.filename;
  const importedFrom = fileName.startsWith("file://")
    ? fromFileUrl(fileName).replace(ctx.base, ".")
    : fileName;
  if (importedFrom !== currRoot[0]) {
    return [fn, [importedFrom, await denoDoc(fileName)]];
  }
  return [fn, currRoot];
};
export const nodeToFunctionDefinition = (
  node: ASTNode
): FunctionTypeDef | undefined => {
  if (isFunctionDef(node) && node.declarationKind === "export") {
    return {
      name: node.name,
      params: node.functionDef.params.map(({ tsType }) => tsType),
      return: node.functionDef.returnType,
    };
  }
  if (node.kind === "variable") {
    const variableTsType = node.variableDef.tsType;
    if (isFnOrConstructor(variableTsType)) {
      return {
        name: node.name,
        params: variableTsType.fnOrConstructor.params.map(
          ({ tsType }) => tsType
        ),
        return: variableTsType.fnOrConstructor.tsType,
      };
    }
  }
  return undefined;
};

export const findAllReturning = async (
  transformContext: TransformContext,
  { typeName, importUrl }: TypeRef,
  asts: ASTNode[]
): Promise<FunctionTypeDef[]> => {
  const importNode = asts.find((ast) => {
    return (
      ast.kind === "import" &&
      ast.importDef.src === importUrl &&
      ast.importDef.imported === typeName
    );
  });
  if (importNode === undefined) {
    return [];
  }
  const importAlias = importNode.name;

  const fns = await Promise.all(
    asts.map(async (ast) => {
      if (
        await isFunctionDefOfReturn(
          transformContext,
          typeName,
          asts,
          importAlias,
          ast
        )
      ) {
        const fAst = ast as FunctionDefNode;
        return {
          name: ast.name,
          params: fAst.functionDef.params.map(({ tsType }) => tsType),
          return: fAst.functionDef.returnType,
        };
      }

      if (ast.kind === "variable") {
        const variableTsType = ast.variableDef.tsType;
        if (
          isFnOrConstructor(variableTsType) &&
          (variableTsType.fnOrConstructor.tsType.repr === importAlias ||
            extendsType(
              transformContext,
              variableTsType.fnOrConstructor.tsType,
              asts,
              typeName
            ))
        ) {
          return {
            name: ast.name,
            params: variableTsType.fnOrConstructor.params.map(
              ({ tsType }) => tsType
            ),
            return: variableTsType.fnOrConstructor.tsType,
          };
        }
      }
      return undefined;
    })
  );
  return fns.filter(notUndefined);
};
