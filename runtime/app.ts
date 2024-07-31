// deno-lint-ignore-file no-explicit-any
import type { ComponentChildren, ComponentType } from "preact";
import { join } from "std/path/join.ts";
import type { RequestState } from "../blocks/utils.tsx";
import type { DecoContext } from "../deco.ts";
import { context as otelContext } from "../deps.ts";
import type { BaseContext } from "../engine/core/resolver.ts";
import { newFsFolderProvider } from "../engine/decofile/fsFolder.ts";
import type { DecofileProvider } from "../engine/decofile/provider.ts";
import { siteNameFromEnv } from "../engine/manifest/manifest.ts";
import { randomSiteName } from "../engine/manifest/utils.ts";
import { newContext, type Resolvable } from "../mod.ts";
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
import { batchInvoke, invoke } from "./features/invoke.ts";
import { type GetMetaOpts, meta } from "./features/meta.ts";
import { preview } from "./features/preview.tsx";
import { render } from "./features/render.tsx";
import { styles } from "./features/styles.css.ts";

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
    manifest?: TAppManifest;
    decofile?: DecofileProvider;
    wrapper?: ComponentType<
        { req: Request; children: ComponentChildren | ComponentChildren[] }
    >;
}

export class Deco<TAppManifest extends AppManifest = AppManifest> {
    private constructor(
        private site: string,
        private ctx: DecoContext<TAppManifest>,
    ) {
    }

    static async init<TAppManifest extends AppManifest = AppManifest>(
        opts?: DecoOptions<TAppManifest>,
    ): Promise<Deco<TAppManifest>> {
        const site = opts?.site ?? siteNameFromEnv() ?? randomSiteName();
        const decofile = opts?.decofile ?? newFsFolderProvider();
        const manifest = opts?.manifest ?? (await import(
            `file://${join(Deno.cwd(), "manifest.gen.ts")}`
        ).then((mod) => mod.default));
        const decoContext = await Promise.resolve(manifest).then((m) =>
            newContext(
                m,
                undefined,
                decofile,
                crypto.randomUUID(),
                site,
            )
        );
        return new Deco<TAppManifest>(site, decoContext);
    }

    meta(opts?: GetMetaOpts) {
        return meta(this.ctx, opts);
    }

    async resolve<T, TContext extends BaseContext>(
        resolvable: string | Resolvable<T>,
        ctx?: Omit<TContext, keyof BaseContext>,
    ): Promise<T> {
        const { resolver } = await this.ctx.runtime!;
        return resolver.resolve(resolvable, ctx ?? {});
    }

    styles(...args: Parameters<typeof styles>) {
        return styles(...args);
    }

    preview(...args: Parameters<typeof preview>) {
        return preview(...args);
    }

    render(...args: Parameters<typeof render>) {
        return render(...args);
    }

    invoke(...args: Parameters<typeof invoke>) {
        return invoke(...args);
    }

    batchInvoke(...args: Parameters<typeof batchInvoke>) {
        return batchInvoke(...args);
    }

    async prepare<TConfig = any>(
        req: Request,
        baseState?: State<TAppManifest, TConfig>,
        { enabled, correlationId }: {
            enabled: boolean;
            correlationId?: string;
        } = { enabled: false },
    ): Promise<State<TAppManifest, TConfig>> {
        const state = baseState ?? {} as State<TAppManifest, TConfig>;
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
                ...console,
                log: () => {},
                error: () => {},
                debug: () => {},
                info: () => {},
            },
        };

        const liveContext = this.ctx;
        const request = forceHttps(req);
        const { resolver } = await this.ctx.runtime!;
        const ctxResolver = resolver
            .resolverFor(
                {
                    context: { state },
                    request,
                },
                {
                    monitoring: state.monitoring,
                },
            )
            .bind(resolver);

        state.resolve = ctxResolver;
        state.release = liveContext.release!;
        state.invoke = buildInvokeFunc(ctxResolver, {}, {
            isInvoke: true,
        });
        const response = {
            headers: new Headers(defaultHeaders),
            status: undefined,
        };
        state.url = new URL(request.url);
        state.response = response;
        state.bag = new WeakMap();
        state.vary = [];
        state.flags = [];
        state.site = {
            id: this.ctx.siteId ?? 0,
            name: this.ctx.site,
        };
        state.global = state;

        return state;
    }
}
