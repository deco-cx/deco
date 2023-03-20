// deno-lint-ignore-file no-explicit-any
import { Resolver } from "$live/engine/core/resolver.ts";
import { PromiseOrValue, UnPromisify } from "$live/engine/core/utils.ts";
import { Schemeable, TransformContext } from "$live/engine/schema/transform.ts";
import {
  DocNode,
  TsTypeDef,
} from "https://deno.land/x/deno_doc@0.58.0/lib/types.d.ts";
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
  TSerializable = T,
> {
  default: RLike;
  preview?: Resolver<PreactComponent, TSerializable, any>;
}

export type ResolverBlock = Block<Resolver>;
// TODO Implementar resolver block @author marcos v. candeia

export type ModuleOf<TBlock> = TBlock extends Block<
  any,
  any,
  any,
  infer TBlockModule
> ? TBlockModule
  : never;

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
  >,
> {
  defaultPreview?: Resolver<PreactComponent, TSerializable, any>;
  type: BType;
  introspect: (
    transformationContext: TransformContext,
    path: string,
    ast: DocNode[],
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
    >,
  >(
    blockModule: TBlockModule,
    key: string,
  ) => TBlockModule;
  adapt?: <TConfig = any>(
    blockModule: TBlockModule,
    key: string,
  ) => Resolver<TSerializable, TConfig, any>;
}

export type ModuleAST = [string, string, DocNode[]];

export type Definitions = Record<string, JSONSchema7>;

export interface FunctionBlockDefinition {
  name: string;
  input: TsTypeDef | undefined | JSONSchema7;
  output: TsTypeDef | JSONSchema7;
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
  Key extends string & keyof T = string & keyof T,
> = `${Key}${Key extends `${infer _}.ts${infer _}` ? ""
  : T[Key] extends JSONSchemaLike ? ""
  : T[Key] extends Record<string, unknown> ? `/${PathOf<T[Key]>}`
  : ""}`;

export type References<TManifestSchemas> = `#/${PathOf<TManifestSchemas>}`;

// deno-lint-ignore ban-types
export type ManifestSchemas = References<{}>; // fixme

export type InstanceOf<
  T,
  _Schema extends T extends Block
    ? `#/root/${T["type"]}` & ManifestSchemas | string
    : ManifestSchemas = T extends Block
      ? `#/root/${T["type"]}` & ManifestSchemas
      : ManifestSchemas,
  TorBlockSerializable = T extends Block<any, infer Serializable> ? Serializable
    : T,
> = TorBlockSerializable;

export type ComponentFunc<
  TProps = any,
  TReturn extends JSX.Element | null = JSX.Element | null,
> = (props: TProps) => TReturn;

export interface ComponentMetadata {
  resolveChain: string[];
  resolver: string;
}

export interface PreactComponent<
  TReturn extends JSX.Element | null = JSX.Element | null,
  TProps = any,
> {
  Component: ComponentFunc<TProps, TReturn>;
  props: TProps;
  metadata?: ComponentMetadata;
}
