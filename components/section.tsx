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
import type { FieldResolver } from "../engine/core/resolver.ts";
import { HttpError } from "../engine/errors.ts";
import { logger } from "../observability/otel/config.ts";
import { useFramework } from "../runtime/handler.tsx";
import { type Device, deviceOf } from "../utils/userAgent.ts";

export interface SectionContext extends HttpContext<RequestState> {
  renderSalt?: string;
  device: Device;
  deploymentId?: string;
  // deno-lint-ignore no-explicit-any
  FallbackWrapper: ComponentType<any>;
}

export const SectionContext: PreactContext<SectionContext | undefined> =
  createContext<SectionContext | undefined>(
    undefined,
  );

// Murmurhash3 was chosen because it is fast
const hasher = new Murmurhash3(); // This object cannot be shared across executions when a `await` keyword is used (which is not the case here).

export const getSectionID = (resolveChain: FieldResolver[]) => {
  for (const { type, value } of resolveChain) {
    hasher.hash(type);
    hasher.hash(`${value}`);
  }
  const id = `${hasher.result()}`;
  hasher.reset();

  return id;
};

const isPreview = ([head]: FieldResolver[]) =>
  head?.type === "resolver" && head?.value === "preview";

interface BoundaryProps {
  error: ComponentFunc<{ error: Error }>;
  loading: ComponentFunc;
  component: string;
}

interface BoundaryState {
  error: Promise<Error> | Error | null;
}

export class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
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
    let renderCount = 0;
    const idPrefix = getSectionID(ctx.resolveChain);
    const debugEnabled = ctx.context?.state?.debugEnabled;
    const renderSaltFromState = ctx.context?.state?.renderSalt;
    // TODO @gimenes This is a fresh thing only. We need to remove it on other framework bindings
    const partialMode = ctx?.context?.state?.partialMode ||
      "replace";
    const metadata = {
      resolveChain: ctx.resolveChain,
      component: ctx.resolveChain.findLast((chain) => chain.type === "resolver")
        ?.value?.toString()!,
    };
    let device: Device | null = null;

    return {
      props,
      Component: (props: TProps) => {
        const { isDeploy, deploymentId } = Context.active();

        // if parent salt is not defined it means that we are at the root level, meaning that we are the first partial in the rendering tree.
        const { renderSalt: parentRenderSalt } = useContext(SectionContext) ??
          {};
        const binding = useFramework();

        // if this is the case, so we can use the renderSaltFromState - which means that we are in a partial rendering phase
        const renderSalt = parentRenderSalt === undefined
          ? renderSaltFromState ?? `${renderCount}`
          : `${parentRenderSalt ?? ""}${renderCount}`; // the render salt is used to prevent duplicate ids in the same page, it starts with parent renderSalt and appends how many time this function is called.
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
                data-resolve-chain={isPreview(ctx.resolveChain)
                  ? JSON.stringify(ctx.resolveChain)
                  : undefined}
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
