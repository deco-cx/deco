// deno-lint-ignore-file no-explicit-any
import { JSONSchema7 } from "https://esm.sh/v103/@types/json-schema@7.0.11/index.d.ts";
import { FunctionComponent } from "preact";
import { Program, TsType } from "../deps.ts";
import { HintNode } from "../engine/core/hints.ts";
import { FieldResolver, Resolver } from "../engine/core/resolver.ts";
import { PromiseOrValue } from "../engine/core/utils.ts";
import { ResolverMiddleware } from "../engine/middleware.ts";
import { Schemeable } from "../engine/schema/transform.ts";
import { AppManifest } from "../types.ts";
import { BlockInvocation } from "./manifest/defaults.ts";

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
  onBeforeResolveProps?: (props: any, hints: HintNode<any>) => any;
};

export type ModuleOf<TBlock> = TBlock extends Block<
  infer TBlockModule
> ? TBlockModule
  : never;

export interface IntrospectParams {
  includeReturn?: boolean | string[] | ((ts: TsType) => TsType | undefined);
  funcNames?: string[];
}

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
  introspect?: IntrospectParams;
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
export type ModuleAST = [string, string, Program];

export type Definitions = Record<string, JSONSchema7>;

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
  _Schema,
> = T extends Block<BlockModule<any, any, infer TSerializable>> ? TSerializable
  : T;

export type BlockTypes<TManifest extends AppManifest = AppManifest> =
  keyof Omit<
    TManifest,
    "config" | "baseUrl"
  >;

export type BlockKeys<TManifest extends AppManifest = AppManifest> = {
  [key in keyof Pick<TManifest, BlockTypes<TManifest>>]: keyof Pick<
    TManifest,
    BlockTypes<TManifest>
  >[key];
}[keyof Pick<TManifest, BlockTypes<TManifest>>];

// TODO each block should be specialized on how to get its serialized version.
export type BlockInstance<
  key extends BlockKeys<TManifest> & string,
  TManifest extends AppManifest = AppManifest,
  block extends BlockFromKey<key, TManifest> = BlockFromKey<key, TManifest>,
> = BlockFunc<key, TManifest, block> extends
  (...args: infer Props) => PromiseOrValue<infer TReturn>
  ? TReturn extends ReturnType<ComponentFunc<any>> ? PreactComponent<Props[0]>
  : TReturn
  : unknown;

export type BlockFunc<
  key extends BlockKeys<TManifest> & string,
  TManifest extends AppManifest = AppManifest,
  block extends BlockFromKey<key, TManifest> = BlockFromKey<key, TManifest>,
> = block extends BlockTypes<TManifest>
  ? TManifest[block][key] extends
    { default: (...args: any) => PromiseOrValue<any> }
    ? TManifest[block][key]["default"]
  : unknown
  : unknown;

export type BlockFromKey<
  TKey extends string,
  TManifest extends AppManifest = AppManifest,
> = TKey extends `${string}/${infer block}/${infer rest}`
  ? block extends BlockTypes<TManifest> ? block
  : BlockFromKey<`${block}/${rest}`, TManifest>
  : never;

export type ResolvableOf<
  key extends BlockKeys<TManifest> & string,
  block extends BlockFromKey<key, TManifest>,
  TManifest extends AppManifest = AppManifest,
> = block extends BlockTypes<TManifest>
  ? TManifest[block][key] extends { default: (...args: infer Props) => any }
    ? Props[0] & { __resolveType: key }
  : { __resolveType: string }
  : { __resolveType: string };

export const isResolvableOf = <
  key extends BlockKeys<TManifest> & string,
  block extends BlockFromKey<key, TManifest>,
  TManifest extends AppManifest = AppManifest,
>(
  key: key,
  v: ResolvableOf<key, block, TManifest> | unknown,
): v is ResolvableOf<key, block, TManifest> => {
  return (v as ResolvableOf<key, block, TManifest>)?.__resolveType === key;
};

export type ComponentFunc<
  TProps = any,
> = FunctionComponent<TProps>;

export interface ComponentMetadata {
  resolveChain: FieldResolver[];
  component: string;
}

export interface PageContext {
  metadata?: ComponentMetadata | undefined;
  params: Record<string, string>;
  url: URL;
}

export interface PreactComponent<
  TProps = any,
> {
  Component: ComponentFunc<TProps>;
  props: TProps;
  metadata?: ComponentMetadata;
}
