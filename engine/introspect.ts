import {
  BlockModule,
  BlockModuleRef,
  IntrospectFunc,
  IntrospectPath,
} from "$live/engine/block.ts";
import {
  TransformContext,
  tsTypeToSchemeable,
} from "$live/engine/schema/transform.ts";
import { denoDoc, fnDefinitionRoot } from "$live/engine/schema/utils.ts";
import {
  DocNode,
  InterfaceDef,
  TsTypeDef,
  TsTypeLiteralDef,
} from "https://deno.land/x/deno_doc@0.58.0/lib/types.d.ts";

type Key = string | number | symbol;

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
  [propName, ...rest]: Key[],
  contextTypes: Record<string, [TsTypeDef, [string, DocNode[]]]>,
): Promise<[TsTypeDef | undefined, [string, DocNode[]]]> => {
  const propTsType = tsType.properties.find((prop) => prop.name === propName)
    ?.tsType;

  if (!propTsType || rest.length === 0) {
    return resolveTsType(propTsType, root, contextTypes);
  }
  return await fromTsType(
    propTsType,
    rest,
    root,
    contextTypes,
  );
};

const fromNode = async (
  node: DocNode,
  addr: (string | number | symbol)[],
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
  addr: Key[],
  root: [string, DocNode[]],
  contextTypes: Record<string, [TsTypeDef, [string, DocNode[]]]>,
): Promise<[TsTypeDef | undefined, [string, DocNode[]]]> => {
  if (tsType.kind === "intersection") {
    for (const tsTypeIntersec of tsType.intersection.toReversed()) {
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

export const introspectAddr = async <
  TBlockModule extends BlockModule = BlockModule,
>(
  addr: IntrospectPath<TBlockModule>,
  ctx: TransformContext,
  path: string,
  ast: DocNode[],
  includeReturn?: boolean,
): Promise<BlockModuleRef | undefined> => {
  const addrKeys = Object.keys(addr);
  if (addrKeys.length === 0) {
    return undefined;
  }
  const funcName = addrKeys[0] as keyof IntrospectPath<TBlockModule>;
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

  const baseBlockRef = {
    functionRef: path,
    outputSchema: includeReturn && fn.return
      ? await tsTypeToSchemeable(fn.return, root)
      : undefined,
  };
  const addrVal = addr[funcName];
  if (typeof addrVal === "string") {
    return {
      ...baseBlockRef,
      inputSchema: +addrVal >= fn.params.length
        ? undefined
        : await tsTypeToSchemeable(fn.params[+addrVal], root),
    };
  }
  if (!addrVal) {
    return baseBlockRef;
  }

  const [paramIdxStr, objPath] = addrVal;
  const paramIdx = +paramIdxStr;
  if (paramIdx >= fn.params.length) {
    return baseBlockRef;
  }
  const typeParam = (objPath as string).split(".");
  const tsType = fn.params[paramIdx];
  const [configType, newRoot] = await fromTsType(tsType, typeParam, [
    path,
    ast,
  ], {});

  if (!configType) {
    return baseBlockRef;
  }
  const inputSchema = await tsTypeToSchemeable(configType, newRoot);
  return {
    ...baseBlockRef,
    inputSchema,
  };
};

export const introspectWith = <TBlockModule extends BlockModule = BlockModule>(
  addr:
    | IntrospectPath<TBlockModule>
    | IntrospectPath<TBlockModule>[]
    | IntrospectFunc,
  includeReturn?: boolean,
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
    const found = await introspectAddr(nodeAddr, ctx, path, ast, includeReturn);
    if (found) {
      return found;
    }
  }
  return undefined;
};
