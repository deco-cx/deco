// deno-lint-ignore-file no-explicit-any
import { RouteConfig } from "$fresh/server.ts";
import { JSX } from "preact";
import { RouteModule } from "$fresh/src/server/types.ts";

export type ComponentFunc<
  TReturn extends JSX.Element = JSX.Element,
  TProps = any
> = (props: TProps) => TReturn;

export interface PreactComponent<
  TReturn extends JSX.Element = JSX.Element,
  TProps = any
> {
  Component: ComponentFunc<TReturn, TProps>;
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
