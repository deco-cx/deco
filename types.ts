// deno-lint-ignore-file no-explicit-any ban-types
import type { Manifest } from "$fresh/server.ts";
import accountBlock from "$live/blocks/account.ts";
import actionBlock from "$live/blocks/action.ts";
import flagBlock from "$live/blocks/flag.ts";
import functionBlock from "$live/blocks/function.ts";
import handlerBlock from "$live/blocks/handler.ts";
import loaderBlock from "$live/blocks/loader.ts";
import matcherBlock from "$live/blocks/matcher.ts";
import pageBlock from "$live/blocks/page.ts";
import sectionBlock from "$live/blocks/section.ts";
import { FnContext } from "$live/blocks/utils.tsx";
import workflowBlock from "$live/blocks/workflow.ts";
import type { JSONSchema7, JSONSchema7Definition } from "$live/deps.ts";
import { ModuleOf } from "$live/engine/block.ts";
import { ResolveFunc } from "$live/engine/core/resolver.ts";
import { PromiseOrValue } from "$live/engine/core/utils.ts";
import { Release } from "$live/engine/releases/provider.ts";
import { createServerTimings } from "$live/utils/timings.ts";
import type { InvocationFunc } from "./clients/withManifest.ts";
import type { Manifest as LiveManifest } from "./live.gen.ts";
export type {
  ErrorBoundaryComponent,
  ErrorBoundaryParams,
} from "$live/blocks/section.ts";

export type JSONSchema = JSONSchema7;
export type JSONSchemaDefinition = JSONSchema7Definition;

export interface DecoManifest extends Manifest {
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

export type RouterContext = {
  flags: Flag[];
  pagePath: string;
};

export interface StatefulContext<T> {
  params: Record<string, string>;
  state: T;
}

export type LiveConfig<
  TConfig = any,
  TState = {},
  TManifest extends DecoManifest = DecoManifest,
> =
  & TState
  & {
    $live: TConfig;
    resolve: ResolveFunc;
    release: Release;
    invoke: InvocationFunc<TManifest>;
  };

export type { PropsLoader } from "$live/blocks/propsLoader.ts";
export type { SectionProps } from "$live/blocks/section.ts";
export type { FnContext } from "$live/blocks/utils.tsx";
export type ActionContext<
  TState = {},
  TManifest extends DecoManifest = LiveManifest,
> = FnContext<TState, TManifest>;
export type LoaderContext<
  TState = {},
  TManifest extends DecoManifest = LiveManifest,
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
