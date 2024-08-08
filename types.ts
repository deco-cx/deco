// deno-lint-ignore-file no-explicit-any ban-types
import type accountBlock from "./blocks/account.ts";
import type actionBlock from "./blocks/action.ts";
import type appBlock from "./blocks/app.ts";
import type {
  AppContext,
  AppManifest,
  AppModule,
  AppRuntime,
} from "./blocks/app.ts";
import type flagBlock from "./blocks/flag.ts";
import type functionBlock from "./blocks/function.ts";
import type handlerBlock from "./blocks/handler.ts";
import type { Handler } from "./blocks/handler.ts";
import type loaderBlock from "./blocks/loader.ts";
import type matcherBlock from "./blocks/matcher.ts";
import type pageBlock from "./blocks/page.tsx";
import type sectionBlock from "./blocks/section.ts";
import type { FnContext } from "./blocks/utils.tsx";
import type workflowBlock from "./blocks/workflow.ts";
import type { InvocationFunc } from "./clients/withManifest.ts";
import type { JSONSchema7, JSONSchema7Definition } from "./deps.ts";
import type { ModuleOf } from "./engine/block.ts";
import type {
  Monitoring,
  Resolvable,
  ResolveFunc,
} from "./engine/core/resolver.ts";
import type { PromiseOrValue } from "./engine/core/utils.ts";
import type { DecofileProvider } from "./engine/decofile/provider.ts";
import type { Deco } from "./runtime/mod.ts";
import type { InvocationProxy } from "./utils/invoke.types.ts";
import type { createServerTimings } from "./utils/timings.ts";

export type { App } from "./blocks/app.ts";
export type {
  ErrorBoundaryComponent,
  ErrorBoundaryParams
} from "./blocks/section.ts";
export type { AppContext, AppManifest, AppModule, AppRuntime };
export type JSONSchema = JSONSchema7;
export type JSONSchemaDefinition = JSONSchema7Definition;

export interface DecoManifest {
  name: string;
  baseUrl: string;
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
  name?: string;
  namespace: string;
}

export type DecoSiteState<T = unknown> = {
  site: Site;
  t: ReturnType<typeof createServerTimings>;
  monitoring: Monitoring;
  global: T;
};

export interface Flag {
  name: string;
  value: boolean;
  isSegment?: boolean;
}

export interface StatefulContext<T> {
  params: Record<string, string>;
  state: T;
}

/**
 * @title Site Route
 * @titleBy pathTemplate
 */
export interface Route {
  pathTemplate: string;
  /**
   * @description if true so the path will be checked agaisnt the coming from request instead of using urlpattern.
   */
  isHref?: boolean;
  // FIXME this should be placed at nested level 3 of the object to avoid being resolved before the routeSelection is executed.
  handler: { value: Resolvable<Handler> };
  /**
   * @title Priority
   * @description higher priority means that this route will be used in favor of other routes with less or none priority
   */
  highPriority?: boolean;
}

export type DecoState<
  TConfig = any,
  TState = {},
  TManifest extends AppManifest = AppManifest,
> =
  & TState
  & {
    deco: Deco<TManifest>;
    url: URL;
    correlationId?: string;
    debugEnabled?: boolean;
    $live: TConfig;
    resolve: ResolveFunc;
    release: DecofileProvider;
    invoke:
      & InvocationProxy<
        TManifest
      >
      & InvocationFunc<TManifest>;
    pathTemplate: string;
    routes?: Route[];
  };

export type { JSONSchema7 } from "npm:@types/json-schema@7.0.11/index.d.ts";
export type { PropsLoader } from "./blocks/propsLoader.ts";
export type { LoadingFallbackProps, SectionProps } from "./blocks/section.ts";
export type { FnContext } from "./blocks/utils.tsx";
export type { ResolveOptions } from "./engine/core/mod.ts";
export type { ResolveFunc } from "./engine/core/resolver.ts";
export type { RouteContext } from "./engine/manifest/manifest.ts";
export type ActionContext<
  TState = {},
  TManifest extends AppManifest = AppManifest,
> = FnContext<TState, TManifest>;
export type LoaderContext<
  TState = {},
  TManifest extends AppManifest = AppManifest,
> = FnContext<TState, TManifest>;

export type FunctionContext<TProps = any, TState = {}> = StatefulContext<
  DecoState<TProps, TState>
>;

export type LoaderFunction<Props = any, Data = any, State = any> = (
  req: Request,
  ctx: FunctionContext<Props, State>,
  props: Props,
) => PromiseOrValue<
  { data: Data } & Partial<Pick<Response, "status" | "headers">>
>;

export type LoaderReturnType<O = unknown> = O;

