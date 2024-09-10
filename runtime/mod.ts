// deno-lint-ignore-file no-explicit-any
import { join, toFileUrl } from "@std/path";
import { type RequestState, vary } from "../blocks/utils.tsx";
import type { DecoContext } from "../deco.ts";
import { context as otelContext } from "../deps.ts";
import type { BaseContext } from "../engine/core/resolver.ts";
import {
  type DecofileProvider,
  getProvider,
} from "../engine/decofile/provider.ts";
import { siteNameFromEnv } from "../engine/manifest/manifest.ts";
import { randomSiteName } from "../engine/manifest/utils.ts";
import { Context } from "../live.ts";
import { newContext, type PreactComponent, type Resolvable } from "../mod.ts";
import { observe } from "../observability/observe.ts";
import { tracer } from "../observability/otel/config.ts";
import {
  REQUEST_CONTEXT_KEY,
  STATE_CONTEXT_KEY,
} from "../observability/otel/context.ts";
import type { AppManifest, DecoSiteState, DecoState } from "../types.ts";
import { defaultHeaders, forceHttps } from "../utils/http.ts";
import { buildInvokeFunc } from "../utils/invoke.server.ts";
import { createServerTimings } from "../utils/timings.ts";
import type { ContextRenderer } from "./deps.ts";
import { batchInvoke, invoke } from "./features/invoke.ts";
import {
  type GetMetaOpts,
  meta,
  type VersionedMetaInfo,
} from "./features/meta.ts";
import { preview } from "./features/preview.tsx";
import {
  type Options,
  render,
  type RenderResponse,
} from "./features/render.tsx";
import { styles } from "./features/styles.css.ts";
import { type Bindings, handlerFor } from "./handler.tsx";

export interface PageParams<TData = any> {
  data: TData;
  url: URL;
  params: Record<string, string>;
}

// TODO is DecoSiteState needed? remove it asap
export type State<
  TAppManifest extends AppManifest = AppManifest,
  TConfig = any,
> = DecoState<TConfig, DecoSiteState, TAppManifest> & RequestState;

export interface DecoOptions<TAppManifest extends AppManifest = AppManifest> {
  site?: string;
  namespace?: string;
  manifest?: TAppManifest;
  decofile?: DecofileProvider;
  bindings?: Bindings<TAppManifest>;
}

const NOOP_CALL = () => {};

export class Deco<TAppManifest extends AppManifest = AppManifest> {
  private _handler: ReturnType<typeof handlerFor> | null = null;
  private constructor(
    public site: string,
    private ctx: DecoContext<TAppManifest>,
    public bindings?: Bindings<TAppManifest>,
  ) {
  }

  static async init<TAppManifest extends AppManifest = AppManifest>(
    opts?: DecoOptions<TAppManifest>,
  ): Promise<Deco<TAppManifest>> {
    const site = opts?.site ?? siteNameFromEnv() ?? randomSiteName();
    const decofile = opts?.decofile ?? await getProvider(site);
    const manifest = opts?.manifest ?? (await import(
      toFileUrl(join(Deno.cwd(), "manifest.gen.ts")).href
    ).then((mod) => mod.default));
    const decoContext = await Promise.resolve(manifest).then((m) =>
      newContext(
        m,
        undefined,
        decofile,
        crypto.randomUUID(),
        site,
        opts?.namespace,
      )
    );
    Context.setDefault(decoContext);
    return new Deco<TAppManifest>(
      site,
      decoContext,
      opts?.bindings,
    );
  }

  meta(opts?: GetMetaOpts): Promise<VersionedMetaInfo | undefined> {
    return meta(this.ctx, opts);
  }

  get handler(): (
    req: Request,
    bindings?:
      | { RENDER_FN?: ContextRenderer | undefined; GLOBALS?: unknown }
      | undefined,
  ) => Response | Promise<Response> {
    return this._handler ??= handlerFor(this);
  }
  get fetch(): (req: Request) => Response | Promise<Response> {
    return (req: Request) => this.handler(req);
  }

  async resolve<T, TContext extends BaseContext>(
    resolvable: string | Resolvable<T>,
    ctx?: Omit<TContext, keyof BaseContext>,
  ): Promise<T> {
    const { resolver } = await this.ctx.runtime!;
    return resolver.resolve(resolvable, ctx ?? {});
  }

  styles(...args: Parameters<typeof styles>): Promise<string> {
    return styles(...args);
  }

  async preview(
    req: Request,
    previewUrl: string,
    props: unknown,
    ctx?: State<TAppManifest>,
  ): Promise<PreactComponent<unknown>> {
    return preview(
      req,
      previewUrl,
      props,
      ctx ?? await this.prepareState({ req: { raw: req, param: () => ({}) } }),
    );
  }

  async render(
    req: Request,
    opts: Options,
    state?: State<TAppManifest>,
  ): Promise<RenderResponse> {
    return render(
      req,
      opts,
      state ??
        await this.prepareState({ req: { raw: req, param: () => ({}) } }),
    );
  }

  invoke(...args: Parameters<typeof invoke>): Promise<unknown> {
    return invoke(...args);
  }

  batchInvoke(
    ...args: Parameters<typeof batchInvoke>
  ): Promise<unknown> {
    return batchInvoke(...args);
  }

  async prepareState<TConfig = any>(
    context: {
      req: { raw: Request; param: () => Record<string, string> };
      base?: unknown;
    },
    { enabled, correlationId }: {
      enabled: boolean;
      correlationId?: string;
    } = { enabled: false },
  ): Promise<State<TAppManifest, TConfig>> {
    const req = context.req.raw;
    const state = (context.base ?? {}) as State<TAppManifest, TConfig>;
    state.deco = this;
    const t = createServerTimings();
    if (enabled) {
      state.t = t;
      state.debugEnabled = true;
      state.correlationId = correlationId;
    }
    state.monitoring = {
      timings: t,
      metrics: observe,
      tracer,
      context: otelContext.active().setValue(REQUEST_CONTEXT_KEY, req)
        .setValue(
          STATE_CONTEXT_KEY,
          state,
        ),
      logger: enabled ? console : {
        assert: NOOP_CALL,
        clear: NOOP_CALL,
        count: NOOP_CALL,
        countReset: NOOP_CALL,
        debug: NOOP_CALL,
        dir: NOOP_CALL,
        dirxml: NOOP_CALL,
        error: NOOP_CALL,
        group: NOOP_CALL,
        groupCollapsed: NOOP_CALL,
        groupEnd: NOOP_CALL,
        info: NOOP_CALL,
        log: NOOP_CALL,
        table: NOOP_CALL,
        time: NOOP_CALL,
        timeEnd: NOOP_CALL,
        timeLog: NOOP_CALL,
        timeStamp: NOOP_CALL,
        trace: NOOP_CALL,
        warn: NOOP_CALL,
      } as Console,
    };

    const liveContext = this.ctx;
    const request = forceHttps(req);

    state.release = liveContext.release!;
    const response = {
      headers: new Headers(defaultHeaders),
      status: undefined,
    };
    state.url = new URL(request.url);
    state.response = response;
    state.bag = new WeakMap();
    state.vary = vary();
    state.flags = [];
    state.site = {
      id: this.ctx.siteId ?? 0,
      name: this.ctx.site,
    };
    state.global = state;
    const { resolver } = await this.ctx.runtime!;
    const ctxResolver = resolver
      .resolverFor(
        {
          context: new Proxy(context, {
            get(target, prop, recv) {
              if (prop === "state") {
                return state;
              }
              if (prop === "params") {
                return context.req.param();
              }
              return Reflect.get(target, prop, recv);
            },
          }),
          request,
        },
        {
          monitoring: state.monitoring,
        },
      )
      .bind(resolver);

    state.resolve = ctxResolver;
    state.invoke = buildInvokeFunc(ctxResolver, {}, {
      isInvoke: true,
    });

    return state;
  }
}

export type { PageData } from "./deps.ts";
export { DECO_SEGMENT } from "./middleware.ts";
export { usePageContext, useRouterContext } from "./routes/entrypoint.tsx";
