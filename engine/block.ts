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
type Cons<H, T> = T extends readonly any[]
  ? ((h: H, ...t: T) => void) extends ((...r: infer R) => void) ? R : never
  : never;

type Prev = [
  never,
  0,
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  17,
  18,
  19,
  20,
  ...0[],
];

type Paths<T, D extends number = 10> = [D] extends [never] ? never
  : T extends object ? {
      [K in keyof T]-?:
        | [K]
        | (Paths<T[K], Prev[D]> extends infer P
          ? P extends [] ? never : Cons<K, P>
          : never);
    }[keyof T]
  : [];

type Leaves<T, D extends number = 10> = [D] extends [never] ? never
  : T extends object
    ? { [K in keyof T]-?: Cons<K, Leaves<T[K], Prev[D]>> }[keyof T]
  : [];
export type IntrospectTypeRef<
  TypeRef,
> = TypeRef extends Record<string, any> ? {
    [key in keyof TypeRef]:
      | key
      | IntrospectTypeRef<TypeRef[key]>;
  }
  : never;

export type IntrospectFuncParam<TMaybeFunc> = TMaybeFunc extends
  (...args: any[]) => any ? (
    | number
    | Record<
      number,
      | Paths<Parameters<TMaybeFunc>[number]>
      | keyof (Parameters<TMaybeFunc>[number])
      | {
        [pKey in keyof (Parameters<TMaybeFunc>[number])]: IntrospectTypeRef<
          Parameters<TMaybeFunc>[number][pKey]
        >;
      }
    >
  )
  : never;

export type IntrospectPath<
  TModule extends BlockModule = BlockModule,
> = {
  [key in keyof TModule]?: IntrospectFuncParam<TModule[key]>;
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
