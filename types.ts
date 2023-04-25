// deno-lint-ignore-file no-explicit-any
import type { Manifest } from "$fresh/server.ts";
import accountBlock from "$live/blocks/account.ts";
import actionBlock from "$live/blocks/action.ts";
import flagBlock from "$live/blocks/flag.ts";
import functionBlock from "$live/blocks/function.ts";
import handlerBlock from "$live/blocks/handler.ts";
import islandBlock from "$live/blocks/island.ts";
import loaderBlock from "$live/blocks/loader.ts";
import matcherBlock from "$live/blocks/matcher.ts";
import pageBlock from "$live/blocks/page.ts";
import sectionBlock from "$live/blocks/section.ts";
import type { JSONSchema7, JSONSchema7Definition } from "$live/deps.ts";
import { ModuleOf } from "$live/engine/block.ts";
import { ResolveFunc } from "$live/engine/core/resolver.ts";
import { createServerTimings } from "$live/utils/timings.ts";

export type JSONSchema = JSONSchema7;
export type JSONSchemaDefinition = JSONSchema7Definition;

export interface DecoManifest extends Manifest {
  islands: Record<string, ModuleOf<typeof islandBlock>>;
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

export type RouterContext = {
  flags: string;
  pagePath: string;
};

export interface StatefulContext<T> {
  params: Record<string, string>;
  state: T;
}
export type LiveConfig<TConfig = any, TState = any> = TState & {
  $live: TConfig;
  resolve: ResolveFunc;
};

// deno-lint-ignore ban-types
export type ActionContext<TProps = any, TState = {}> = StatefulContext<
  LiveConfig<TProps, TState>
>;

// deno-lint-ignore ban-types
export type LoaderContext<TProps = any, TState = {}> = StatefulContext<
  LiveConfig<TProps, TState>
>;
export type LoaderFunction<Props = any, Data = any, State = any> = (
  req: Request,
  ctx: LoaderContext<Props, State>,
  props: Props,
) => Promise<{ data: Data } & Partial<Pick<Response, "status" | "headers">>>;

export type LoaderReturnType<O = unknown> = O;
