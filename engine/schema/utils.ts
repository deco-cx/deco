import { fromFileUrl } from "https://deno.land/std@0.61.0/path/mod.ts";
import type { JSONSchema7 as Schema } from "json-schema";
import { basename } from "std/path/mod.ts";
import { notUndefined } from "../core/utils.ts";
import {
  ASTNode,
  FunctionDefNode,
  TsType,
  TsTypeFnOrConstructor,
} from "./ast.ts";
import {
  beautify,
  findExport,
  getSchemaId,
  tsTypeToSchema,
} from "./transform.ts";
import { TransformContext } from "./transformv2.ts";

export const getSchemaFromSectionExport = async (
  nodes: ASTNode[],
  path: string
) => {
  const node = findExport("default", nodes);

  if (!node) return { inputSchema: null, outputSchema: null };

  if (node.kind !== "variable" && node.kind !== "function") {
    throw new Error(
      `Section default export needs to be a component like element`
    );
  }

  if (node.kind === "function" && node.functionDef.params.length > 1) {
    throw new Error(
      `Section function component should have at most one argument`
    );
  }

  const tsType =
    node.kind === "variable"
      ? node.variableDef.tsType
      : node.functionDef.params[0]?.tsType;

  // Only fetching inputSchema (from exported Props) if the default function
  // has its input type specified ({ ... }: Props)
  const inputSchema = tsType && (await tsTypeToSchema(tsType, nodes));

  // Add a rich name to the editor
  if (inputSchema) {
    inputSchema.title = beautify(basename(path));
  }

  return {
    inputSchema: inputSchema ?? null,
    outputSchema: null,
  };
};

export const getSchemaFromLoaderExport = async (
  nodes: ASTNode[],
  path: string
) => {
  const node = findExport("default", nodes);

  if (!node) return { inputSchema: null, outputSchema: null };

  if (node.kind !== "variable") {
    throw new Error("Default export needs to be a const variable");
  }

  const tsType = node.variableDef.tsType;

  if (
    tsType.kind !== "typeRef" ||
    tsType.typeRef.typeName in
      ["LoaderFunction", "MatchFunction", "EffectFunction"]
  ) {
    throw new Error(`Default export needs to be of type LoaderFunction`);
  }

  const [propType = null, returnType = null] = tsType.typeRef.typeParams ?? [];

  const inputSchema = propType && (await tsTypeToSchema(propType, nodes));
  const outputType = returnType && (await tsTypeToSchema(returnType, nodes));
  const outputSchema: Schema | null = outputType && {
    type: "object",
    properties: {
      data: {
        $id: await getSchemaId(outputType),
      },
    },
    additionalProperties: true,
  };

  // Add a rich name to the editor
  if (inputSchema) {
    inputSchema.title = beautify(basename(path));
  }

  return {
    inputSchema: inputSchema ?? null,
    outputSchema: outputSchema ?? null,
  };
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
