// deno-lint-ignore-file no-explicit-any
import { Resolver } from "$live/engine/core/resolver.ts";
import { PromiseOrValue } from "$live/engine/core/utils.ts";
import { ResolverMiddleware } from "$live/engine/middleware.ts";
import { Schemeable, TransformContext } from "$live/engine/schema/transform.ts";
import type { Manifest } from "$live/live.gen.ts";
import { DecoManifest } from "$live/types.ts";
import { DotNestedKeys } from "$live/utils/object.ts";
import {
  DocNode,
  TsTypeDef,
} from "https://deno.land/x/deno_doc@0.58.0/lib/types.d.ts";
import { JSONSchema7 } from "https://esm.sh/v103/@types/json-schema@7.0.11/index.d.ts";
import { JSX } from "preact";
import { BlockInvocation } from "./fresh/defaults.ts";

export interface BlockModuleRef {
  inputSchema?: Schemeable;
  outputSchema?: Schemeable;
  functionRef: ImportString;
  functionJSDoc?: JSONSchema7;
}

export type ResolverLike<T = any> = (...args: any[]) => PromiseOrValue<T>;
export type BlockModule<
  TDefaultExportFunc extends ResolverLike<T> = ResolverLike,
  T = TDefaultExportFunc extends ResolverLike<infer TValue> ? TValue : any,
  TSerializable = T,
> = {
  default: TDefaultExportFunc;
  invoke?: Resolver<TSerializable, BlockInvocation, any>;
  preview?: Resolver<PreactComponent, TSerializable, any>;
  Preview?: ComponentFunc;
};

export type IntrospectFunc = (
  ctx: TransformContext,
  path: string,
  ast: DocNode[],
) => Promise<BlockModuleRef | undefined>;

export type ModuleOf<TBlock> = TBlock extends Block<
  infer TBlockModule
> ? TBlockModule
  : never;

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
    : Required<TModule>[key] extends Record<string, any> ? string | string[]
    : never;
};

export interface Block<
  TBlockModule extends BlockModule<
    TDefaultExportFunc,
    TProvides,
    TSerializable
  > = BlockModule<any>,
  TDefaultExportFunc extends ResolverLike<TProvides> = ResolverLike,
  BType extends BlockType = BlockType,
  TProvides = any,
  TSerializable = any,
> {
  defaultDanglingRecover?: Resolver<TSerializable> | ResolverMiddleware<
    TSerializable
  >[];
  defaultPreview?: Resolver<PreactComponent, TSerializable, any>;
  defaultInvoke?: Resolver<TSerializable, BlockInvocation, any>;
  type: BType;
  introspect:
    | IntrospectPath<TBlockModule>
    | IntrospectPath<TBlockModule>[]
    | IntrospectFunc;
  decorate?: <
    TBlockModule extends BlockModule<
      TDefaultExportFunc,
      TProvides,
      TSerializable
    > = BlockModule<
      TDefaultExportFunc,
      TProvides,
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
export type ManifestSchemas = References<{}>; // FIXME (mcandeia) this was used when the schema is part of the code as a module

export type InstanceOf<
  T,
  _Schema extends T extends Block
    ? `#/root/${T["type"]}` & ManifestSchemas | string
    : ManifestSchemas = T extends Block
      ? `#/root/${T["type"]}` & ManifestSchemas
      : ManifestSchemas,
> = T extends Block<BlockModule<any, any, infer TSerializable>> ? TSerializable
  : T;

export type BlockTypes<TManifest extends DecoManifest = Manifest> = keyof Omit<
  TManifest,
  "config" | "baseUrl"
>;

export type BlockKeys<TManifest extends DecoManifest = Manifest> = {
  [key in keyof Pick<TManifest, BlockTypes<TManifest>>]: keyof Pick<
    TManifest,
    BlockTypes<TManifest>
  >[key];
}[keyof Pick<TManifest, BlockTypes<TManifest>>];

// TODO each block should be specialized on how to get its serialized version.
export type BlockInstance<
  key extends BlockKeys<TManifest> & string,
  TManifest extends DecoManifest = Manifest,
  block extends BlockFromKey<key, TManifest> = BlockFromKey<key, TManifest>,
> = block extends BlockTypes<TManifest>
  ? TManifest[block][key] extends
    { default: (...args: infer Props) => PromiseOrValue<infer TReturn> }
    ? TReturn extends (JSX.Element | null)
      ? PreactComponent<JSX.Element | null, Props[0]>
    : TReturn
  : unknown
  : unknown;

export type BlockFromKey<
  TKey extends string,
  TManifest extends DecoManifest = Manifest,
> = TKey extends `${string}/${infer block}/${infer rest}`
  ? block extends BlockTypes<TManifest> ? block
  : BlockFromKey<`${block}/${rest}`, TManifest>
  : never;

export type ResolvableOf<
  key extends BlockKeys<TManifest> & string,
  block extends BlockFromKey<key, TManifest>,
  TManifest extends DecoManifest = Manifest,
> = block extends BlockTypes<TManifest>
  ? TManifest[block][key] extends { default: (...args: infer Props) => any }
    ? Props[0] & { __resolveType: key }
  : { __resolveType: string }
  : { __resolveType: string };

export const isResolvableOf = <
  key extends BlockKeys<TManifest> & string,
  block extends BlockFromKey<key, TManifest>,
  TManifest extends DecoManifest = Manifest,
>(
  key: key,
  v: ResolvableOf<key, block, TManifest> | unknown,
): v is ResolvableOf<key, block, TManifest> => {
  return (v as ResolvableOf<key, block, TManifest>)?.__resolveType === key;
};

export type ComponentFunc<
  TProps = any,
  TReturn extends JSX.Element | null = JSX.Element | null,
> = (props: TProps) => TReturn;

export interface ComponentMetadata {
  resolveChain: string[];
  component: string;
  /**
   * This property is used to reference child position, during LivePage edit mode.
   *
   * Ex.: Sections inside UseSlot has indexes different from the Slot itself. In this case, UseSlot adds this `real` childIndex.
   */
  childIndex?: number;
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
