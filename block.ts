// deno-lint-ignore-file no-explicit-any
import {
  FreshContext,
  PreactComponent,
} from "$live/engine/adapters/fresh/adapters.ts";
import { Resolver } from "$live/engine/core/resolver.ts";
import { ASTNode, TsType } from "$live/engine/schema/ast.ts";
import * as J from "https://deno.land/x/jsonschema@v1.4.1/jsonschema.ts";
import {
  JSONSchema7,
  JSONSchema7Definition,
} from "https://esm.sh/v103/@types/json-schema@7.0.11/index.d.ts";
import { PromiseOrValue } from "./engine/core/utils.ts";
import { schemeableToJSONSchema } from "./engine/schema/schemeable.ts";
import { tsTypeToSchemeable } from "./engine/schema/transformv2.ts";

export interface FunctionBlockSchema {
  inputSchema?: string;
  outputSchema: string;
}

export interface TypeBlockSchema {
  type: string;
}

export type ModuleAST = [string, string, ASTNode[]];

export type BlockAddress = FunctionBlockSchema | TypeBlockSchema;

export type Definitions = Record<string, JSONSchema7>;

export interface BlockDefinitionBase {
  name: string;
}

export interface TypeBlockDefinition extends BlockDefinitionBase {
  type: TsType;
}

export interface FunctionBlockDefinition extends BlockDefinitionBase {
  input: TsType | undefined | JSONSchema7;
  output: TsType | JSONSchema7;
}

export type BlockDefinition = FunctionBlockDefinition | TypeBlockDefinition;

export interface BlockBase<TBlock = any, TBockDefinition = any> {
  defaultJSONSchemaDefinitions?: Record<string, JSONSchema7Definition>;
  type: string;
  preview: Resolver<PreactComponent, TBlock, FreshContext>;
  run: Resolver<Response, TBlock, FreshContext>;
  findModuleDefinitions: (ast: ASTNode[]) => PromiseOrValue<TBockDefinition[]>;
}

// TODO blocks should have default definitions and handle well-known types
export interface TypeBlock<TBlock = any>
  extends BlockBase<TBlock, TypeBlockDefinition> {
  intercept: <TExtension extends TBlock>(
    block?: (blk: TExtension, ctx: FreshContext) => PromiseOrValue<TExtension>
  ) => Resolver<TExtension, TExtension, FreshContext>;
}

export interface FunctionBlock<TBlock = any, TIntermediate = TBlock>
  extends BlockBase<TIntermediate, FunctionBlockDefinition> {
  adapt: <TProps>(
    block: TBlock
  ) => Resolver<TIntermediate, TProps, FreshContext>;
}

export const isFunctionBlock = (b: Block): b is FunctionBlock => {
  return (b as FunctionBlock).adapt !== undefined;
};

export type Block<TBlock = any, TIntermediate = TBlock> = TBlock extends (
  ...args: any[]
) => any
  ? FunctionBlock<TBlock, TIntermediate>
  : TypeBlock<TBlock>;

export interface LiveBlocks {
  definitions: Definitions;
  blocks: Record<string, Record<string, BlockAddress>>;
}

const isTsType = (t: TsType | JSONSchema7): t is TsType => {
  return (t as TsType).kind !== undefined;
};

interface TypeSchema {
  addr: string;
  schema: JSONSchema7;
}

interface FunctionSchema {
  addr: string;
  schema: {
    input: JSONSchema7 | undefined;
    output: JSONSchema7;
  };
}
type IBlkSchema = FunctionSchema | TypeSchema;
const mapTypeBlockDefinition =
  (entrypoint: string, ast: ASTNode[]) =>
  async (def: TypeBlockDefinition): Promise<TypeSchema> => {
    const schema = tsTypeToSchemeable(entrypoint, def.type, ast)
      .then(schemeableToJSONSchema)
      .then((s) => J.print(s) as JSONSchema7);

    return {
      addr: def.name,
      schema: await schema,
    };
  };

const mapFunctionBlockDefinition =
  (entrypoint: string, ast: ASTNode[]) =>
  async (def: FunctionBlockDefinition): Promise<FunctionSchema> => {
    let tsTypeInputSchemaPromise: Promise<JSONSchema7 | undefined> =
      Promise.resolve(undefined);
    if (def.input !== undefined) {
      if (isTsType(def.input)) {
        tsTypeInputSchemaPromise = tsTypeToSchemeable(
          entrypoint,
          def.input,
          ast
        )
          .then(schemeableToJSONSchema)
          .then((s) => {
            return J.print(s) as JSONSchema7;
          });
      } else {
        tsTypeInputSchemaPromise = Promise.resolve(def.input);
      }
    }
    let tsTypeOutputSchemaPromise: Promise<JSONSchema7> = Promise.resolve({});

    if (!isTsType(def.output)) {
      tsTypeOutputSchemaPromise = Promise.resolve(def.output);
    } else {
      tsTypeOutputSchemaPromise = tsTypeToSchemeable(
        entrypoint,
        def.output,
        ast
      )
        .then(schemeableToJSONSchema)
        .then((s) => {
          return J.print(s) as JSONSchema7;
        });
    }
    const [input, output] = await Promise.all([
      tsTypeInputSchemaPromise,
      tsTypeOutputSchemaPromise,
    ]);

    return {
      addr: def.name,
      schema: {
        input,
        output,
      },
    };
  };

const isFunctionBlockDefinitions = (
  v: TypeBlockDefinition[] | FunctionBlockDefinition[]
): v is FunctionBlockDefinition[] => {
  return v.length > 0 && (v[0] as FunctionBlockDefinition).output !== undefined;
};

const isFunctionBlockSchema = (
  v: TypeSchema | FunctionSchema
): v is FunctionSchema => {
  return (v as FunctionSchema).schema.output !== undefined;
};
const liveBlocksOf = async (
  block: Block,
  [entrypoint, path, ast]: ModuleAST
): Promise<LiveBlocks> => {
  const definitions = await block.findModuleDefinitions(ast);
  const blockAddresses: IBlkSchema[] = await Promise.all(
    isFunctionBlockDefinitions(definitions)
      ? definitions.map(mapFunctionBlockDefinition(entrypoint, ast))
      : definitions.map(mapTypeBlockDefinition(entrypoint, ast))
  );

  const [def, blocks] = blockAddresses.reduce(
    ([definitions, blks], blk) => {
      const blockAddr = blk.addr === "default" ? path : `${path}@${blk.addr}`;
      if (isFunctionBlockSchema(blk)) {
        const inputSchema = blk.schema.input;
        const inputRef = inputSchema ? inputSchema.$ref : undefined;
        const { $ref } = blk.schema.output;
        return [
          {
            ...definitions,
            ...(inputSchema ? inputSchema.definitions : {}),
            ...blk.schema.output.definitions,
          },
          {
            ...blks,
            [blockAddr]: {
              inputSchema: inputRef,
              outputSchema: $ref!,
            },
          },
        ];
      }
      return [
        {
          ...definitions,
          ...blk.schema.definitions,
        },
        {
          ...blks,
          [blockAddr]: { type: blk.schema.$ref! },
        },
      ];
    },
    [{}, {}] as [
      Record<string, JSONSchema7Definition>,
      Record<string, BlockAddress>
    ]
  );
  return {
    definitions: def as Record<string, JSONSchema7>,
    blocks: {
      [block.type]: blocks,
    },
  };
};

export const buildingBlocks = async (
  blocks: Block[],
  code: ModuleAST[]
): Promise<LiveBlocks> => {
  const initialBlocks: LiveBlocks = {
    definitions: blocks.reduce(
      (def, blk) => ({ ...def, ...(blk.defaultJSONSchemaDefinitions ?? {}) }),
      {}
    ),
    blocks: {},
  };

  const merge = (blk1: LiveBlocks, blk2: LiveBlocks) => {
    const merged = blk1.blocks;
    for (const blk of blocks) {
      merged[blk.type] = { ...merged[blk.type], ...blk2.blocks[blk.type] };
    }

    return {
      blocks: merged,
      definitions: {
        ...blk1.definitions,
        ...blk2.definitions,
      },
    };
  };
  const liveBlocks = await Promise.all(
    blocks
      .map((block) => {
        return code.map((module) => liveBlocksOf(block, module)).flat();
      })
      .flat()
  );

  return liveBlocks.reduce(merge, initialBlocks);
};
