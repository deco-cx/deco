// deno-lint-ignore-file no-explicit-any
import { RouteConfig } from "$fresh/server.ts";
import { JSX } from "preact";
import { RouteModule } from "$fresh/src/server/types.ts";

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
}

export type LiveConfig<TConfig = any, TState = unknown> = TState & {
  $live: TConfig;
};

export interface LiveRouteConfig extends RouteConfig {
  liveKey?: string;
}

export interface LiveRouteModule extends RouteModule {
  config?: LiveRouteConfig;
}
