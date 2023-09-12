// deno-lint-ignore-file no-explicit-any ban-types
import type { Manifest } from "$fresh/server.ts";
import accountBlock from "./blocks/account.ts";
import actionBlock from "./blocks/action.ts";
import appBlock, {
  AppContext,
  AppManifest,
  AppModule,
  AppRuntime,
  SourceMap,
} from "./blocks/app.ts";
import flagBlock from "./blocks/flag.ts";
import functionBlock from "./blocks/function.ts";
import handlerBlock from "./blocks/handler.ts";
import loaderBlock from "./blocks/loader.ts";
import matcherBlock from "./blocks/matcher.ts";
import pageBlock from "./blocks/page.ts";
import sectionBlock from "./blocks/section.ts";
import { FnContext } from "./blocks/utils.tsx";
import workflowBlock from "./blocks/workflow.ts";
import type { InvocationFunc } from "./clients/withManifest.ts";
import type { JSONSchema7, JSONSchema7Definition } from "./deps.ts";
import { ModuleOf } from "./engine/block.ts";
import { ResolveFunc } from "./engine/core/resolver.ts";
import { PromiseOrValue } from "./engine/core/utils.ts";
import { Release } from "./engine/releases/provider.ts";
import { Route } from "./flags/audience.ts";
import { createServerTimings } from "./utils/timings.ts";
import type { InvocationProxy } from "./routes/live/invoke/index.ts";
export type {
  ErrorBoundaryComponent,
  ErrorBoundaryParams,
} from "./blocks/section.ts";
export type { AppContext, AppManifest, AppModule, AppRuntime };

export type { App } from "./blocks/app.ts";

export type JSONSchema = JSONSchema7;
export type JSONSchemaDefinition = JSONSchema7Definition;

export interface DecoManifest extends Manifest {
  name: string;
  apps?: Record<string, ModuleOf<typeof appBlock>>;
  workflows?: Record<string, ModuleOf<typeof workflowBlock>>;
  actions?: Record<string, ModuleOf<typeof actionBlock>>;
  sections?: Record<string, ModuleOf<typeof sectionBlock>>;
  functions?: Record<string, ModuleOf<typeof functionBlock>>;
  loaders?: Record<string, ModuleOf<typeof loaderBlock>>;
  pages?: Record<string, ModuleOf<typeof pageBlock>>;
  matchers?: Record<string, ModuleOf<typeof matcherBlock>>;
  handlers?: Record<string, ModuleOf<typeof handlerBlock>>;
  flags?: Record<string, ModuleOf<typeof flagBlock>>;
  accounts?: Record<string, ModuleOf<typeof accountBlock>>;
}

export interface Site {
  id: number;
  name: string;
  thumb_url?: string;
  github_repo_url?: string;
  created_from?: Site;
  domains?: Array<{ domain: string; production: boolean }>;
}

export interface SiteInfo {
  siteId?: number;
  namespace: string;
}

export type LiveState<T = unknown> = {
  site: Site;
  t: ReturnType<typeof createServerTimings>;
  global: T;
};

export interface Flag {
  name: string;
  value: boolean;
}

export interface StatefulContext<T> {
  params: Record<string, string>;
  state: T;
}

export type LiveConfig<
  TConfig = any,
  TState = {},
  TManifest extends AppManifest = AppManifest,
> =
  & TState
  & {
    debugEnabled?: boolean;
    log: (...args: any[]) => void;
    $live: TConfig;
    resolve: ResolveFunc;
    release: Release;
    invoke:
      & InvocationProxy<
        TManifest
      >
      & InvocationFunc<TManifest>;
    routes?: Route[];
    flags: Flag[];
    pathTemplate: string;
    manifest: TManifest;
    sourceMap: SourceMap;
  };

export type { PropsLoader } from "./blocks/propsLoader.ts";
export type { SectionProps } from "./blocks/section.ts";
export type { FnContext } from "./blocks/utils.tsx";
export type ActionContext<
  TState = {},
  TManifest extends AppManifest = AppManifest,
> = FnContext<TState, TManifest>;
export type LoaderContext<
  TState = {},
  TManifest extends AppManifest = AppManifest,
> = FnContext<TState, TManifest>;

export type FunctionContext<TProps = any, TState = {}> = StatefulContext<
  LiveConfig<TProps, TState>
>;

export type LoaderFunction<Props = any, Data = any, State = any> = (
  req: Request,
  ctx: FunctionContext<Props, State>,
  props: Props,
) => PromiseOrValue<
  { data: Data } & Partial<Pick<Response, "status" | "headers">>
>;

export type LoaderReturnType<O = unknown> = O;
