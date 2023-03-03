// deno-lint-ignore-file no-explicit-any
import { RouteConfig } from "$fresh/server.ts";
import { RouteModule } from "$fresh/src/server/types.ts";
import { Block } from "$live/engine/block.ts";
import { ResolveFunc } from "$live/engine/core/resolver.ts";
import { JSX } from "preact";

export type InstanceOf<
  TBlock extends Block,
  _Schema extends `#/root/${TBlock["type"]}` = `#/root/${TBlock["type"]}`,
  TBlockSerializable = TBlock extends Block<any, infer Serializable>
    ? Serializable
    : never,
> = TBlockSerializable;

export type ComponentFunc<
  TProps = any,
  TReturn extends JSX.Element = JSX.Element,
> = (props: TProps) => TReturn;

export interface PreactComponent<
  TReturn extends JSX.Element = JSX.Element,
  TProps = any,
> {
  Component: ComponentFunc<TProps, TReturn>;
  props: TProps;
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
