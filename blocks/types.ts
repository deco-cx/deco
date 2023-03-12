// deno-lint-ignore-file no-explicit-any
import { RouteConfig } from "$fresh/server.ts";
import { RouteModule } from "$fresh/src/server/types.ts";
import { Block } from "$live/engine/block.ts";
import { ResolveFunc } from "$live/engine/core/resolver.ts";
import { JSX } from "preact";
import manifest from "$live/live.gen.ts";

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

export interface LiveRouteConfig extends RouteConfig {
  liveKey?: string;
}

export interface LiveRouteModule extends RouteModule {
  config?: LiveRouteConfig;
}
