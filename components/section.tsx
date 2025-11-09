/** @jsxRuntime automatic */
/** @jsxImportSource preact */

import type { Context as PreactContext, JSX } from "preact";
import {
  Component,
  type ComponentChildren,
  type ComponentType,
  createContext,
} from "preact";
import { useContext } from "preact/hooks";
import type { HttpContext } from "../blocks/handler.ts";
import type { RequestState } from "../blocks/utils.tsx";
import { Context } from "../deco.ts";
import { type DeepPartial, Murmurhash3 } from "../deps.ts";
import type { ComponentFunc, ComponentMetadata } from "../engine/block.ts";
import {
  FieldResolver as FieldResolverUtil,
  type FieldResolver as FieldResolverType,
} from "../engine/core/resolver.ts";
import { HttpError } from "../engine/errors.ts";
import { logger } from "../observability/otel/config.ts";
import { useFramework } from "../runtime/handler.tsx";
import { type Device, deviceOf } from "../utils/userAgent.ts";
import type { DebugProperties } from "../utils/vary.ts";

export interface SectionContext extends HttpContext<RequestState> {
  renderSalt?: string;
  device: Device;
  deploymentId?: string;
  // deno-lint-ignore no-explicit-any
  FallbackWrapper: ComponentType<any>;
}

/**
 * Preact context for storing section context.
 */
export const SectionContext: PreactContext<SectionContext | undefined> =
  createContext<SectionContext | undefined>(
    undefined,
  );

// Murmurhash3 was chosen because it is fast
const hasher = new Murmurhash3(); // This object cannot be shared across executions when a `await` keyword is used (which is not the case here).

export const getSectionID = (resolveChain: FieldResolverType[]) => {
  for (const { type, value } of resolveChain) {
    hasher.hash(type);
    hasher.hash(`${value}`);
  }
  const id = `${hasher.result()}`;
  hasher.reset();

  return id;
};

const isPreview = ([head]: FieldResolverType[]) =>
  head?.type === "resolver" && head?.value === "preview";

type LoaderCacheMode =
  | "no-store"
  | "no-cache"
  | "stale-while-revalidate"
  | "disabled";
type LoaderCacheStatus = "bypass" | "miss" | "stale" | "hit" | "error";

type LoaderSummary = {
  loader: string;
  status: LoaderCacheStatus;
  latencyMs: number;
  cacheMode: LoaderCacheMode;
  cacheConfigured: boolean;
  cacheKey: string | null;
  cacheMaxAge: number | null;
};

type LoaderDebugEntry = DebugProperties & {
  kind: "loader";
  loader: string;
  resolveChain: FieldResolverType[];
  resolveChainMinified: (string | number)[];
  status: LoaderCacheStatus;
  latencyMs: number;
  cache: {
    mode: LoaderCacheMode;
    maxAge?: number;
    key?: string | null;
    configured: boolean;
  };
};

const isLoaderDebugEntry = (
  entry: DebugProperties,
): entry is LoaderDebugEntry => {
  const maybeLoader = entry as LoaderDebugEntry;
  return maybeLoader?.kind === "loader" &&
    Array.isArray(maybeLoader.resolveChainMinified);
};

const chainIsPrefix = (
  parent: (string | number)[],
  target: (string | number)[],
): boolean => {
  if (parent.length > target.length) {
    return false;
  }
  for (let idx = 0; idx < parent.length; idx++) {
    if (parent[idx] !== target[idx]) {
      return false;
    }
  }
  return true;
};

const summarizeCacheStatus = (
  entries: LoaderDebugEntry[],
): "none" | LoaderCacheStatus | "mixed" => {
  if (entries.length === 0) {
    return "none";
  }
  if (entries.some((entry) => entry.status === "error")) {
    return "error";
  }
  if (entries.some((entry) => entry.status === "miss")) {
    return "miss";
  }
  if (entries.some((entry) => entry.status === "stale")) {
    return "stale";
  }
  if (entries.some((entry) => entry.status === "bypass")) {
    return "bypass";
  }
  const allHit = entries.every((entry) => entry.status === "hit");
  if (allHit) {
    return "hit";
  }
  return "mixed";
};

const findParentResolver = (
  chain: FieldResolverType[],
): string | undefined => {
  const resolvers = chain.filter((entry) => entry.type === "resolver");
  if (resolvers.length < 2) {
    return undefined;
  }
  return resolvers[resolvers.length - 2]?.value?.toString();
};

const computeSourceProp = (
  chain: FieldResolverType[],
): string | undefined => {
  const resolverIndex = chain.findLastIndex((entry) =>
    entry.type === "resolver"
  );
  if (resolverIndex <= 0) {
    return undefined;
  }
  for (let idx = resolverIndex - 1; idx >= 0; idx--) {
    const entry = chain[idx];
    if (entry.type === "resolver") {
      break;
    }
    if (entry.type === "prop" && typeof entry.value === "string") {
      return entry.value;
    }
  }
  return undefined;
};

const detectAsyncMode = (
  chain: FieldResolverType[],
): "lazy" | "deferred" | "false" => {
  const resolverNames = chain
    .filter((entry) => entry.type === "resolver")
    .map((entry) => entry.value?.toString() ?? "");
  if (resolverNames.some((name) => name.includes("Rendering/Lazy"))) {
    return "lazy";
  }
  if (resolverNames.some((name) => name.includes("Rendering/Deferred"))) {
    return "deferred";
  }
  return "false";
};

interface BoundaryProps {
  error: ComponentFunc<{ error: Error }>;
  loading: ComponentFunc;
  component: string;
}

interface BoundaryState {
  error: Promise<Error> | Error | null;
}

export class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  override state = { error: null };

  static override getDerivedStateFromError(error: Error) {
    if (error instanceof HttpError) {
      throw error;
    }
    return { error };
  }

  render() {
    const error = this.state.error as Error | null;
    const { loading: Loading, error: Error, children } = this.props;

    const mode = error?.name === "AbortError"
      ? "loading"
      : error
      ? "error"
      : "children";

    if (mode === "error") {
      const msg = `rendering: ${this.props.component} ${
        (error as Error)?.stack
      }`;
      logger.error(msg);
      console.error(msg);
    }

    if (mode === "loading") {
      return <Loading />;
    }

    if (mode === "error") {
      return <Error error={error!} />;
    }

    return <>{children}</>;
  }
}

export interface Framework {
  name: string;
  Head?: (headProps: { children: ComponentChildren }) => null;
  Wrapper: ComponentType<
    { id: string; partialMode?: "replace" | "append" | "prepend" }
  >;
  ErrorFallback: ComponentType<{
    id: string;
    name: string;
    debugEnabled?: boolean;
    isDeploy: boolean;
    error: Error;
  }>;
  LoadingFallback: ComponentType<
    { id: string; props?: Record<string, unknown> }
  >;
}

export const alwaysThrow =
  (err: unknown): ComponentFunc => (_props: unknown) => {
    throw err;
  };
const MAX_RENDER_COUNT = 5_00; // for saved sections this number should mark a restart.
export function withSection<TProps, TLoaderProps = TProps>(
  resolver: string,
  ComponentFunc: ComponentFunc,
  LoadingFallback?: ComponentType<DeepPartial<TLoaderProps>>,
  ErrorFallback?: ComponentType<{ error?: Error }>,
  loaderProps?: TLoaderProps,
): (
  props: TProps,
  ctx: HttpContext<
    RequestState & {
      renderSalt?: string;
      partialMode?: "replace" | "prepend" | "append";
    }
  >,
) => {
  LoadingFallback?: (() => JSX.Element) | undefined;
  props: TProps;
  Component: (props: TProps) => JSX.Element;
  metadata: ComponentMetadata;
} {
  return ((
    props: TProps,
    ctx: HttpContext<
      RequestState & {
        renderSalt?: string;
        partialMode?: "replace" | "prepend" | "append";
      }
    >,
  ) => {
    const sectionChain = ctx.resolveChain;
    let renderCount = 0;
    const idPrefix = getSectionID(sectionChain);
    const debugEnabled = ctx.context?.state?.debugEnabled;
    const renderSaltFromState = ctx.context?.state?.renderSalt;
    // TODO @gimenes This is a fresh thing only. We need to remove it on other framework bindings
    const partialMode = ctx?.context?.state?.partialMode ||
      "replace";
    const metadata = {
      resolveChain: sectionChain,
      component: sectionChain.findLast((chain) => chain.type === "resolver")
        ?.value?.toString()!,
    };
    const sectionChainMinified = FieldResolverUtil.minify(sectionChain);
    const parentResolver = findParentResolver(sectionChain);
    const sourceProp = computeSourceProp(sectionChain);
    const asyncMode = detectAsyncMode(sectionChain);
    const resolveChainMinJson = JSON.stringify(sectionChainMinified);
    let device: Device | null = null;

    return {
      props,
      Component: (props: TProps) => {
        const { isDeploy, deploymentId } = Context.active();
        const debugActive = debugEnabled || !isDeploy;
        const inline = sourceProp === "sections";
        const blockDef = inline ? (parentResolver ?? resolver) : resolver;
        let loaderSummaries: LoaderSummary[] = [];
        let cacheSummary: "none" | LoaderCacheStatus | "mixed" = "none";
        let debugAttributes: Record<string, string | undefined> | undefined;
        if (debugActive) {
          const debugEntries = ctx.context?.state?.vary?.debug
            ? ctx.context.state.vary.debug.build<DebugProperties>()
            : [];
          const loaderDebugEntries = debugEntries
            .filter(isLoaderDebugEntry)
            .filter((entry) =>
              chainIsPrefix(sectionChainMinified, entry.resolveChainMinified)
            );
          // Expose resolver telemetry via data-* attributes so the debug overlay
          // can light up detailed caching information when debugging is enabled.
          loaderSummaries = loaderDebugEntries.map((entry) => ({
            loader: entry.loader,
            status: entry.status,
            latencyMs: Number(entry.latencyMs.toFixed(2)),
            cacheMode: entry.cache.mode,
            cacheConfigured: entry.cache.configured,
            cacheKey: entry.cache.key ?? null,
            cacheMaxAge: entry.cache.maxAge ?? null,
          }));
          cacheSummary = summarizeCacheStatus(loaderDebugEntries);
          debugAttributes = {
            "data-block-def": blockDef ?? resolver,
            "data-block-component": resolver,
            "data-host-resolver": parentResolver,
            "data-source-prop": sourceProp,
            "data-inline": inline ? "true" : "false",
            "data-async": asyncMode,
            "data-loaders": loaderSummaries.length
              ? JSON.stringify(loaderSummaries)
              : undefined,
            "data-pure": loaderSummaries.length === 0 ? "true" : "false",
            "data-cache-summary": cacheSummary,
            "data-resolve-chain-min": resolveChainMinJson,
            "data-loader-count": loaderSummaries.length
              ? `${loaderSummaries.length}`
              : undefined,
            "data-debug-active": "true",
          };
        }

        // if parent salt is not defined it means that we are at the root level, meaning that we are the first partial in the rendering tree.
        const { renderSalt: parentRenderSalt } = useContext(SectionContext) ??
          {};
        const binding = useFramework();

        // if this is the case, so we can use the renderSaltFromState - which means that we are in a partial rendering phase
        const renderSalt = parentRenderSalt === undefined
          ? renderSaltFromState ?? `${renderCount}`
          : `${parentRenderSalt ?? ""}${renderCount}`; // the render salt is used to prevent duplicate ids in the same page, it starts with parent renderSalt and appends how many times this function is called.
        const id = `${idPrefix}-${renderSalt}`; // all children of the same parent will have the same renderSalt, but different renderCount
        renderCount = ++renderCount % MAX_RENDER_COUNT;

        return (
          <SectionContext.Provider
            value={{
              ...ctx,
              deploymentId,
              renderSalt,
              FallbackWrapper: ({ children, ...props }) => (
                <binding.LoadingFallback id={id} {...props}>
                  {children}
                </binding.LoadingFallback>
              ),
              get device() {
                return device ??= deviceOf(ctx.request);
              },
            }}
          >
            <binding.Wrapper id={id} partialMode={partialMode}>
              <section
                id={id}
                data-manifest-key={resolver}
                data-resolve-chain={isPreview(sectionChain)
                  ? JSON.stringify(sectionChain)
                  : undefined}
                {...(debugAttributes ?? {})}
              >
                <ErrorBoundary
                  component={resolver}
                  loading={() => (
                    <binding.LoadingFallback id={id}>
                      {LoadingFallback
                        ? (
                          // @ts-ignore difficult typing this
                          <LoadingFallback
                            {...new Proxy<Partial<TProps>>(props, {
                              get: (value: Partial<TProps>, prop) => {
                                try {
                                  return Reflect.get(value, prop);
                                } catch (_) {
                                  return undefined;
                                }
                              },
                            })}
                          />
                        )
                        : <></>}
                    </binding.LoadingFallback>
                  )}
                  error={({ error }) => (
                    ErrorFallback
                      ? <ErrorFallback error={error} />
                      : (
                        <binding.ErrorFallback
                          id={id}
                          name={resolver}
                          error={error}
                          isDeploy={isDeploy}
                          debugEnabled={debugEnabled}
                        />
                      )
                  )}
                >
                  <ComponentFunc {...props} />
                </ErrorBoundary>
              </section>
            </binding.Wrapper>
          </SectionContext.Provider>
        );
      },
      metadata,
      ...LoadingFallback
        ? {
          LoadingFallback: () => {
            return (
              // @ts-ignore: could not it type well
              <LoadingFallback
                {...(loaderProps ?? props) as DeepPartial<TLoaderProps>}
              />
            );
          },
        }
        : {},
    };
  });
}
