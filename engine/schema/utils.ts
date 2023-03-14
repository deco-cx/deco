import {
  ASTNode,
  FunctionDefNode,
  JSDoc,
  Tag,
  TsType,
  TsTypeFnOrConstructor,
} from "$live/engine/schema/ast.ts";
import { TransformContext } from "$live/engine/schema/transform.ts";
import { fromFileUrl } from "https://deno.land/std@0.61.0/path/mod.ts";

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
        .filter((e): e is [string, string | number | boolean] => !!e),
    )
    : undefined;

export const findExport = (name: string, root: ASTNode[]) => {
  const node = root.find(
    (n) => n.name === name && n.declarationKind === "export",
  );

  if (!node) {
    console.error(
      `Could not find export for ${name}. Are you exporting all necessary elements?`,
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
  process.close();
  process.stderr.close();

  if (!status.success) {
    throw new Error(
      `Error while running ${cmd.join(" ")} with status ${status.code}`,
    );
  }

  return new TextDecoder().decode(stdout);
};

export const denoDoc = async (path: string): Promise<ASTNode[]> => {
  const promise = denoDocCache.get(path) ??
    exec(["deno", "doc", "--json", path]);

  denoDocCache.set(path, promise);
  const stdout = await promise;
  return JSON.parse(stdout);
};

export interface TypeRef {
  typeName: string;
  importUrl: string;
}

export const isFunctionDef = (node: ASTNode): node is FunctionDefNode => {
  return node.kind === "function";
};

export interface FunctionTypeDef {
  name: string;
  params: TsType[];
  return: TsType;
}

export const isFnOrConstructor = (
  tsType: TsType,
): tsType is TsTypeFnOrConstructor => {
  return tsType.kind === "fnOrConstructor";
};

export const fnDefinitionRoot = async (
  ctx: TransformContext,
  node: ASTNode,
  currRoot: [string, ASTNode[]],
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
  node: ASTNode,
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
          ({ tsType }) => tsType,
        ),
        return: variableTsType.fnOrConstructor.tsType,
      };
    }
  }
  return undefined;
};
