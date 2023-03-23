import { JSONSchema7 } from "$live/deps.ts";
import {
  BlockModuleRef,
  FunctionBlockDefinition,
  IntrospectFunc,
} from "$live/engine/block.ts";
import {
  inlineOrSchemeable,
  Schemeable,
  TransformContext,
  tsTypeToSchemeableOrUndefined,
} from "$live/engine/schema/transform.ts";
import { denoDoc, fnDefinitionRoot } from "$live/engine/schema/utils.ts";
import {
  DocNode,
  InterfaceDef,
  TsTypeDef,
  TsTypeLiteralDef,
} from "https://deno.land/x/deno_doc@0.58.0/lib/types.d.ts";

export interface TsTypeAddr {
  [key: string | number]: TsTypeAddr | string;
}

export interface FunctionNodeAddr {
  [key: string]: number | {
    [key: number]: TsTypeAddr | string;
  };
}

export const fnDefinitionToSchemeable = async (
  ast: [string, DocNode[]],
  validFn: FunctionBlockDefinition,
): Promise<Schemeable> => {
  const inputSchemeable = await inlineOrSchemeable(ast, validFn.input);
  const outputSchemeable = await inlineOrSchemeable(ast, validFn.output);
  return {
    required: ["input", "output"],
    title: validFn.name,
    type: "object",
    id: validFn.name,
    value: {
      output: {
        title: (validFn.output as TsTypeDef).repr ??
          (validFn.output as JSONSchema7).title,
        jsDocSchema: {},
        schemeable: outputSchemeable!,
      },
      ...(inputSchemeable
        ? {
          input: {
            title: (validFn.input as TsTypeDef).repr ??
              (validFn.input as JSONSchema7).title,
            jsDocSchema: {},
            schemeable: inputSchemeable,
          },
        }
        : {}),
    },
  };
};

const resolveTsType = (
  tsType: TsTypeDef | undefined,
  root: [string, DocNode[]],
  contextTypes: Record<string, [TsTypeDef, [string, DocNode[]]]>,
): [TsTypeDef | undefined, [string, DocNode[]]] => {
  if (!tsType || tsType.kind !== "typeRef") {
    return [tsType, root];
  }
  const ctxType = contextTypes[tsType.typeRef.typeName];
  if (!ctxType) {
    return [tsType, root];
  }
  return resolveTsType(ctxType[0], ctxType[1], contextTypes);
};
const fromTypeLiteralOrInterface = async (
  tsType: TsTypeLiteralDef | InterfaceDef,
  root: [string, DocNode[]],
  addr: TsTypeAddr | string,
  contextTypes: Record<string, [TsTypeDef, [string, DocNode[]]]>,
): Promise<[TsTypeDef | undefined, [string, DocNode[]]]> => {
  const propName = typeof addr === "string" ? addr : Object.keys(addr)[0];
  const propTsType = tsType.properties.find((prop) => prop.name === propName)
    ?.tsType;

  if (!propTsType || typeof addr !== "object") {
    return resolveTsType(propTsType, root, contextTypes);
  }
  return await fromTsType(
    propTsType,
    addr[Object.keys(addr)[0]],
    root,
    contextTypes,
  );
};

const fromNode = async (
  node: DocNode,
  addr: TsTypeAddr | string,
  root: [string, DocNode[]],
  contextTypes: Record<string, [TsTypeDef, [string, DocNode[]]]>,
  typeParams?: [TsTypeDef[], [string, DocNode[]]],
): Promise<[TsTypeDef | undefined, [string, DocNode[]]]> => {
  if (node.kind === "import") {
    const newRoots = await denoDoc(node.importDef.src);
    const newRoot = newRoots.find((n) => {
      return n.name === node.importDef.imported;
    });
    if (!newRoot) {
      return [undefined, root];
    }
    return fromNode(
      newRoot,
      addr,
      [node.importDef.src, newRoots],
      contextTypes,
      typeParams,
    );
  }

  const nodeTypeParams = node.kind === "typeAlias"
    ? node.typeAliasDef.typeParams
    : node.kind === "interface"
    ? node.interfaceDef.typeParams
    : [];

  const ctx: Record<string, [TsTypeDef, [string, DocNode[]]]> =
    ((typeParams && typeParams[0]) ?? []).reduce((currCtx, tp, i) => {
      const [newTp, newRoot] = resolveTsType(
        tp,
        typeParams![1],
        currCtx,
      );
      return {
        ...currCtx,
        [nodeTypeParams[i].name]: [newTp!, newRoot],
      };
    }, contextTypes);

  if (node.kind === "typeAlias") {
    return fromTsType(node.typeAliasDef.tsType, addr, root, ctx);
  }
  if (node.kind === "interface") {
    return fromTypeLiteralOrInterface(
      node.interfaceDef,
      root,
      addr,
      ctx,
    );
  }
  return [undefined, root];
};

const fromTsType = async (
  tsType: TsTypeDef,
  addr: TsTypeAddr | string,
  root: [string, DocNode[]],
  contextTypes: Record<string, [TsTypeDef, [string, DocNode[]]]>,
): Promise<[TsTypeDef | undefined, [string, DocNode[]]]> => {
  if (tsType.kind === "intersection") {
    for (const tsTypeIntersec of tsType.intersection.reverse()) {
      const found = fromTsType(tsTypeIntersec, addr, root, contextTypes);
      if (found) {
        return found;
      }
    }
    return [undefined, root];
  }
  if (tsType.kind === "typeRef") {
    const rootNode = root[1].find((n) => {
      return n.name === tsType.typeRef.typeName;
    });
    if (!rootNode) {
      const fromCtx = contextTypes[tsType.typeRef.typeName];
      if (fromCtx) {
        return fromTsType(fromCtx[0], addr, fromCtx[1], contextTypes);
      }
      return [undefined, root];
    }
    return await fromNode(
      rootNode,
      addr,
      root,
      contextTypes,
      [tsType.typeRef.typeParams ?? [], root],
    );
  }
  if (tsType.kind !== "typeLiteral") {
    return [undefined, root];
  }
  return fromTypeLiteralOrInterface(
    tsType.typeLiteral,
    root,
    addr,
    contextTypes,
  );
};

export const introspectAddr = async (
  addr: FunctionNodeAddr,
  ctx: TransformContext,
  path: string,
  ast: DocNode[],
  ignoreReturn?: boolean,
) => {
  const addrKeys = Object.keys(addr);
  if (addrKeys.length === 0) {
    return undefined;
  }
  const funcName = addrKeys[0];
  const func = ast.find(
    (n) => n.name === funcName && n.declarationKind === "export",
  );
  if (!func) {
    return undefined;
  }
  const [fn, root] = await fnDefinitionRoot(ctx, func, [path, ast]);
  if (!fn) {
    return undefined;
  }

  const shouldIgnoreReturn = ignoreReturn !== undefined && ignoreReturn;
  const baseBlockRef = {
    functionRef: path,
    outputSchema: !shouldIgnoreReturn && fn.return
      ? await tsTypeToSchemeableOrUndefined(fn.return, root)
      : undefined,
  };
  const addrVal = addr[funcName];
  if (typeof addrVal === "number") {
    return {
      ...baseBlockRef,
      inputSchema: addrVal >= fn.params.length
        ? undefined
        : await tsTypeToSchemeableOrUndefined(fn.params[addrVal], root),
    };
  }

  const tsTypeKeys = Object.keys(addrVal);
  if (tsTypeKeys.length === 0) {
    return undefined;
  }
  const paramIdx = +tsTypeKeys[0];
  if (paramIdx >= fn.params.length) {
    return baseBlockRef;
  }
  const typeParam = addrVal[paramIdx];
  const tsType = fn.params[paramIdx];
  if (path.includes("catchall")) {
    console.log(tsType, typeParam);
  }
  const [configType, newRoot] = await fromTsType(tsType, typeParam, [
    path,
    ast,
  ], {});

  if (!configType) {
    return baseBlockRef;
  }
  const inputSchema = await tsTypeToSchemeableOrUndefined(configType, newRoot);
  return {
    ...baseBlockRef,
    inputSchema,
  };
};

export const introspectWith = (
  addr: FunctionNodeAddr | FunctionNodeAddr[] | IntrospectFunc,
  ignoreReturn?: boolean,
) =>
async (
  ctx: TransformContext,
  path: string,
  ast: DocNode[],
): Promise<BlockModuleRef | undefined> => {
  if (typeof addr === "function") {
    return await addr(ctx, path, ast);
  }
  const addrs = Array.isArray(addr) ? addr : [addr];

  for (const nodeAddr of addrs) {
    const found = await introspectAddr(nodeAddr, ctx, path, ast, ignoreReturn);
    if (found) {
      return found;
    }
  }
  return undefined;
};
