// deno-lint-ignore-file no-explicit-any
import { FreshContext } from "$live/engine/adapters/fresh/manifest.ts";
import { Resolver } from "$live/engine/core/resolver.ts";
import { PromiseOrValue } from "$live/engine/core/utils.ts";
import { ASTNode, TsType } from "$live/engine/schema/ast.ts";
import { Schemeable, TransformContext } from "$live/engine/schema/transform.ts";
import { JSONSchema7 } from "https://esm.sh/v103/@types/json-schema@7.0.11/index.d.ts";
import { PreactComponent } from "../blocks/types.ts";

export interface BlockModuleRef {
  inputSchema?: Schemeable;
  outputSchema: Schemeable;
  functionRef: ImportString;
}

export type ResolverLike<T = any> = (...args: any[]) => PromiseOrValue<T>;
export interface BlockModule<
  T = any,
  RLike extends ResolverLike<T> = ResolverLike<T>,
  TSerializable = T
> {
  default: RLike;
  preview?: Resolver<PreactComponent, TSerializable>;
}

type UnPromisify<T> = T extends Promise<infer U> ? U : T;

export interface Block<
  TBlockFunc extends (...args: any[]) => any = any,
  TSerializable = UnPromisify<ReturnType<TBlockFunc>>
> {
  defaultPreview?: Resolver<PreactComponent, TSerializable>;
  baseSchema?: [string, JSONSchema7];
  type: BlockType;
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
  adapt?: <
    TProps = any,
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
  ) => Resolver<TSerializable, TProps, FreshContext>;
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
