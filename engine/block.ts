// deno-lint-ignore-file no-explicit-any
import { Resolver } from "$live/engine/core/resolver.ts";
import { PromiseOrValue, UnPromisify } from "$live/engine/core/utils.ts";
import { ResolverMiddleware } from "$live/engine/middleware.ts";
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

export type IntrospectFunc = (
  ctx: TransformContext,
  path: string,
  ast: DocNode[],
) => Promise<BlockModuleRef | undefined>;

export type ResolverBlock = Block<Resolver>;
// TODO Implementar resolver block @author marcos v. candeia

export type ModuleOf<TBlock> = TBlock extends Block<
  any,
  any,
  any,
  infer TBlockModule
> ? TBlockModule
  : never;

type DotPrefix<T extends string> = T extends "" ? "" : `.${T}`;

type DotNestedKeys<T> =
  // deno-lint-ignore ban-types
  (T extends object ? {
      [K in Exclude<keyof T, symbol>]:
        (`${K}` | `${K}${DotPrefix<DotNestedKeys<T[K]>>}`);
    }[Exclude<keyof T, symbol>]
    : "") extends infer D ? Extract<D, string> : never;

type ValidParams<
  Func extends (...args: any[]) => any,
  N extends keyof Parameters<Func> = keyof Parameters<Func>,
> = Parameters<Func>[N] extends undefined ? never : N;

export type IntrospectFuncParam<
  Func extends (...args: any[]) => any,
  K extends ValidParams<Func> & string = ValidParams<Func> & string,
> =
  | K
  | [K, DotNestedKeys<Parameters<Func>[K]>];

export type IntrospectPath<
  TModule extends BlockModule = BlockModule,
> = {
  [key in keyof TModule]?: Required<TModule>[key] extends
    (...args: any[]) => any ? IntrospectFuncParam<Required<TModule>[key]>
    : never;
};

export type BlockForModule<
  TBlockModule extends BlockModule,
  BType extends BlockType = BlockType,
> = TBlockModule extends BlockModule<infer _, infer TFunc, infer TSerializable>
  ? Block<TFunc, TSerializable, BType, TBlockModule>
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
  defaultDanglingRecover?: Resolver<TSerializable> | ResolverMiddleware<
    TSerializable
  >[];
  defaultPreview?: Resolver<PreactComponent, TSerializable, any>;
  type: BType;
  introspect:
    | IntrospectPath<TBlockModule>
    | IntrospectPath<TBlockModule>[]
    | IntrospectFunc;
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
  ) => Resolver<TSerializable, TConfig, any> | ResolverMiddleware<
    TSerializable,
    TConfig,
    any
  >[];
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
  id?: string;
  resolveChain: string[];
  component: string;
}

export interface PageContext {
  metadata?: ComponentMetadata | undefined;
  params: Record<string, string>;
  url: URL;
}

export interface PreactComponent<
  TReturn extends JSX.Element | null = JSX.Element | null,
  TProps = any,
> {
  Component: ComponentFunc<TProps, TReturn>;
  props: TProps;
  metadata?: ComponentMetadata;
}
