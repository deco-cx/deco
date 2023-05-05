import { TransformContext } from "$live/engine/schema/transform.ts";
import { join } from "https://deno.land/std@0.170.0/path/mod.ts";
import { fromFileUrl } from "https://deno.land/std@0.61.0/path/mod.ts";
import {
  DocNode,
  DocNodeFunction,
  JsDoc,
  JsDocTag,
  JsDocTagUnsupported,
  JsDocTagValued,
  TsTypeDef,
  TsTypeFnOrConstructorDef,
} from "https://deno.land/x/deno_doc@0.59.0/lib/types.d.ts";
import { doc } from "https://deno.land/x/deno_doc@0.59.0/mod.ts";

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

export const jsDocToSchema = (node: JsDoc) =>
  node.tags
    ? Object.fromEntries(
      node.tags
        .map((tag: JsDocTag) => {
          if (tag.kind === "deprecated") {
            return ["deprecated", true] as const;
          }

          const match = (tag as JsDocTagValued).value?.match(
            /^@(?<key>[a-zA-Z]+) (?<value>.*)$/,
          );

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

export const findExport = (name: string, root: DocNode[]) => {
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
const denoDocCache = new Map<string, Promise<DocNode[]>>();

export const exec = async (cmd: string[]) => {
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

const docAsLib = (path: string, importMap?: string): Promise<DocNode[]> => {
  return doc(path, {
    importMap: importMap ?? join("file://", Deno.cwd(), "import_map.json"),
  });
};

const docAsExec = async (
  path: string,
  _?: string,
): Promise<DocNode[]> => {
  return JSON.parse(await exec(["deno", "doc", "--json", path])); // FIXME(mcandeia) add --private when stable
};
export const denoDoc = async (
  path: string,
  importMap?: string,
): Promise<DocNode[]> => {
  try {
    const promise = denoDocCache.get(path) ??
      (typeof Deno.run === "function"
        ? docAsExec(path)
        : docAsLib(path, importMap));
    denoDocCache.set(path, promise);
    return await promise;
  } catch (err) {
    console.warn("deno doc error, ignoring", err);
    return [];
  }
};

export interface TypeRef {
  typeName: string;
  importUrl: string;
}

export const isFunctionDef = (node: DocNode): node is DocNodeFunction => {
  return node.kind === "function";
};

export interface FunctionTypeDef {
  name: string;
  params: TsTypeDef[];
  return: TsTypeDef;
}

export const isFnOrConstructor = (
  tsType: TsTypeDef,
): tsType is TsTypeFnOrConstructorDef => {
  return tsType.kind === "fnOrConstructor";
};

export const fnDefinitionRoot = async (
  ctx: TransformContext,
  node: DocNode,
  currRoot: [string, DocNode[]],
): Promise<[FunctionTypeDef | undefined, [string, DocNode[]]]> => {
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
  node: DocNode,
): FunctionTypeDef | undefined => {
  if (isFunctionDef(node) && node.declarationKind === "export") {
    return {
      name: node.name,
      params: node.functionDef.params.map(({ tsType }) => tsType!),
      return: node.functionDef.returnType!,
    };
  }
  if (node.kind === "variable") {
    const variableTsType = node.variableDef.tsType;
    if (!variableTsType) {
      return undefined;
    }
    if (isFnOrConstructor(variableTsType)) {
      return {
        name: node.name,
        params: variableTsType.fnOrConstructor.params.map(
          ({ tsType }) => tsType!,
        ),
        return: variableTsType.fnOrConstructor.tsType,
      };
    }
    if (
      variableTsType.kind === "typeRef" &&
      variableTsType.typeRef.typeName === "LoaderFunction"
    ) {
      const params = variableTsType.typeRef.typeParams;
      if (!params || params.length < 2) {
        return undefined;
      }
      return {
        name: node.name,
        params: [params[0]],
        return: params[1],
      };
    }

    if (
      variableTsType.kind === "typeRef" &&
      variableTsType.typeRef.typeName === "PropsLoader"
    ) {
      const params = variableTsType.typeRef.typeParams;
      if (!params || params.length < 2) {
        return undefined;
      }
      return {
        name: node.name,
        params: [params[0], params[1]],
        return: params[1],
      };
    }
  }
  return undefined;
};
