// deno-lint-ignore-file no-explicit-any
import { ResolveFunc, Resolver } from "$live/engine/core/resolver.ts";
import { PromiseOrValue, UnPromisify } from "$live/engine/core/utils.ts";
import { ASTNode, TsType } from "$live/engine/schema/ast.ts";
import { Schemeable, TransformContext } from "$live/engine/schema/transform.ts";
import manifest from "$live/fresh.gen.ts";
import { JSONSchema7 } from "https://esm.sh/v103/@types/json-schema@7.0.11/index.d.ts";
import { JSX } from "preact";

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
  preview?: Resolver<PreactComponent, TSerializable, any>;
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
  defaultPreview?: Resolver<PreactComponent, TSerializable, any>;
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
  ) => Resolver<TSerializable, TConfig, any>;
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

type JSONSchemaLike =
  | { title: string }
  | { anyOf: unknown[] }
  | { type: string }
  | { $ref: string };

export type PathOf<
  T,
  Key extends string & keyof T = string & keyof T
> = `${Key}${Key extends `${infer _}.ts${infer _}`
  ? ""
  : T[Key] extends JSONSchemaLike
  ? ""
  : T[Key] extends Record<string, unknown>
  ? `/${PathOf<T[Key]>}`
  : ""}`;

export type References<TManifestSchemas> = `#/${PathOf<TManifestSchemas>}`;

export type ManifestSchemas = References<typeof manifest["schemas"]>;

export type InstanceOf<
  T,
  _Schema extends T extends Block
    ? `#/root/${T["type"]}` & ManifestSchemas
    : ManifestSchemas = T extends Block
    ? `#/root/${T["type"]}` & ManifestSchemas
    : ManifestSchemas,
  TorBlockSerializable = T extends Block<any, infer Serializable>
    ? Serializable
    : T
> = TorBlockSerializable;

export type ComponentFunc<
  TProps = any,
  TReturn extends JSX.Element = JSX.Element
> = (props: TProps) => TReturn;

export interface PreactComponent<
  TReturn extends JSX.Element = JSX.Element,
  TProps = any
> {
  Component: ComponentFunc<TProps, TReturn>;
  props: TProps;
  key?: string;
}

export type LiveConfig<TConfig = any, TState = unknown> = TState & {
  $live: TConfig;
  resolve: ResolveFunc;
};
