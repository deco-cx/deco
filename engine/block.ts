// deno-lint-ignore-file no-explicit-any
import { FreshContext } from "$live/engine/adapters/fresh/manifest.ts";
import { Resolver } from "$live/engine/core/resolver.ts";
import { PromiseOrValue, UnPromisify } from "$live/engine/core/utils.ts";
import { ASTNode, TsType } from "$live/engine/schema/ast.ts";
import { Schemeable, TransformContext } from "$live/engine/schema/transform.ts";
import { JSONSchema7 } from "https://esm.sh/v103/@types/json-schema@7.0.11/index.d.ts";
import { PreactComponent } from "../blocks/types.ts";

export interface BlockModuleRef {
  inputSchema?: Schemeable;
  outputSchema?: Schemeable;
  functionRef: ImportString;
}

export type ResolverLike<T = any> = (...args: any[]) => PromiseOrValue<T>;
export interface BlockModule<
  T = any,
  RLike extends ResolverLike<T> = ResolverLike<T>,
  TSerializable = T
> {
  default: RLike;
  preview?: Resolver<PreactComponent, TSerializable, FreshContext>;
}

export type ResolverBlock = Block<Resolver>;
// TODO Implementar resolver block @author marcos v. candeia

export interface Block<
  TBlockFunc extends (...args: any[]) => any = any,
  TSerializable = UnPromisify<ReturnType<TBlockFunc>>,
  BType extends BlockType = BlockType,
  TBlockModule extends BlockModule<
    UnPromisify<ReturnType<TBlockFunc>>,
    TBlockFunc,
    TSerializable
  > = BlockModule<
    UnPromisify<ReturnType<TBlockFunc>>,
    TBlockFunc,
    TSerializable
  >
> {
  defaultPreview?: Resolver<PreactComponent, TSerializable, FreshContext>;
  type: BType;
  introspect: (
    transformationContext: TransformContext,
    path: string,
    ast: ASTNode[]
  ) => Promise<BlockModuleRef | undefined>;
  decorate?: <
    TBlockModule extends BlockModule<
      UnPromisify<ReturnType<TBlockFunc>>,
      TBlockFunc,
      TSerializable
    > = BlockModule<
      UnPromisify<ReturnType<TBlockFunc>>,
      TBlockFunc,
      TSerializable
    >
  >(
    blockModule: TBlockModule,
    key: string
  ) => TBlockModule;
  adapt?: <TConfig = any>(
    blockModule: TBlockModule,
    key: string
  ) => Resolver<TSerializable, TConfig, FreshContext>;
}

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
