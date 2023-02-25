// deno-lint-ignore-file no-explicit-any
import { FreshContext } from "$live/engine/adapters/fresh/manifest.ts";
import { Resolver } from "$live/engine/core/resolver.ts";
import { PromiseOrValue } from "$live/engine/core/utils.ts";
import { ASTNode, TsType } from "$live/engine/schema/ast.ts";
import {
  Schemeable,
  TransformContext,
} from "$live/engine/schema/transformv2.ts";
import {
  JSONSchema7,
  JSONSchema7Definition,
} from "https://esm.sh/v103/@types/json-schema@7.0.11/index.d.ts";

export type ModuleAST = [string, string, ASTNode[]];

export type Definitions = Record<string, JSONSchema7>;

export interface FunctionBlockDefinition {
  name: string;
  input: TsType | undefined | JSONSchema7;
  output: TsType | JSONSchema7;
}

export type BlockType = string;
export type ImportString = string;
export type BlockAlias = string;

export interface BlockDefinitions {
  imports: ImportString[];
  schemeables: Schemeable[];
}

export interface BlockBase {
  import: string;
  type: BlockType;
  defaultJSONSchemaDefinitions?: Record<string, JSONSchema7Definition>;
  findModuleDefinitions: (
    transformContext: TransformContext,
    ast: [string, ASTNode[]]
  ) => Promise<BlockDefinitions>;
}

export interface DataBlock<TBlock = any> extends BlockBase {
  adapt: <TExtension extends TBlock>(
    block: (blk: TExtension, ctx: FreshContext) => PromiseOrValue<TExtension>
  ) => Resolver<TExtension, TExtension, FreshContext>;
}

export interface FunctionBlock<
  TBlockDefinition = any,
  TIntermediate = TBlockDefinition
> extends BlockBase {
  adapt: <TProps>(
    block: TBlockDefinition
  ) => Resolver<TIntermediate, TProps, FreshContext>;
}

export const isFunctionBlock = (b: Block): b is FunctionBlock => {
  return (b as FunctionBlock).adapt !== undefined;
};

export type Block<
  TBlockDefinition = any,
  TIntermediate = TBlockDefinition
> = TBlockDefinition extends (...args: any[]) => any
  ? FunctionBlock<TBlockDefinition, TIntermediate>
  : DataBlock<TBlockDefinition>;
