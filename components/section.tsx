import { Head, Partial } from "$fresh/runtime.ts";
import { PartialProps } from "$fresh/src/runtime/Partial.tsx";
import { Component, ComponentType, createContext } from "preact";
import { useContext } from "preact/hooks";
import { HttpContext } from "../blocks/handler.ts";
import { RequestState } from "../blocks/utils.tsx";
import { Context } from "../deco.ts";
import { Murmurhash3 } from "../deps.ts";
import { ComponentFunc } from "../engine/block.ts";
import { FieldResolver } from "../engine/core/resolver.ts";
import { HttpError } from "../engine/errors.ts";
import { usePartialSection } from "../hooks/usePartialSection.ts";
import { logger } from "../observability/otel/config.ts";

export interface SectionContext extends HttpContext<RequestState> {
  renderSalt?: string;
}

export const SectionContext = createContext<
  SectionContext | undefined
>(
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
    const error = this.state.error as any;
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
      return <Error error={error} />;
    }

    return <>{children}</>;
  }
}

const script = (id: string) => {
  function init() {
    const elem = document.getElementById(id);
    const parent = elem?.parentElement;

    if (elem == null || parent == null) {
      console.error(
        `Missing element of id ${id} or its parent element. Async rendering will NOT work properly`,
      );
      return;
    }

    const observeAndClose = (e: IntersectionObserverEntry[]) => {
      e.forEach((entry) => {
        if (entry.isIntersecting) {
          elem.click();
          observer.disconnect();
        }
      });
    };
    const observer = new IntersectionObserver(observeAndClose);
    observer.observe(parent);
    observeAndClose(observer.takeRecords());
  }

  if (document.readyState === "complete") {
    init();
  } else {
    addEventListener("load", init);
  }
};

const dataURI = (fn: typeof script, id: string) =>
  btoa(
    `decodeURIComponent(escape(${
      unescape(encodeURIComponent(`((${fn})("${id}"))`))
    }))`,
  );

const MAX_RENDER_COUNT = 5_00; // for saved sections this number should mark a restart.
export const withSection = <TProps,>(
  resolver: string,
  ComponentFunc: ComponentFunc,
  LoadingFallback?: ComponentType,
  ErrorFallback?: ComponentType<{ error?: Error }>,
) =>
(
  props: TProps,
  ctx: HttpContext<
    RequestState & { renderSalt?: string; partialMode?: PartialProps["mode"] }
  >,
) => {
  let renderCount = 0;
  const idPrefix = getSectionID(ctx.resolveChain);
  const debugEnabled = ctx.context?.state?.debugEnabled;
  const renderSaltFromState = ctx.context?.state?.renderSalt;
  const partialMode = ctx.context.state.partialMode ||
    "replace";

  return {
    props,
    Component: (props: TProps) => {
      // if parent salt is not defined it means that we are at the root level, meaning that we are the first partial in the rendering tree.
      const parentRenderSalt = useContext(SectionContext)?.renderSalt;
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
            renderSalt,
          }}
        >
          <Partial name={id} mode={partialMode}>
            <section
              id={id}
              data-manifest-key={resolver}
              data-resolve-chain={isPreview(ctx.resolveChain)
                ? JSON.stringify(ctx.resolveChain)
                : undefined}
            >
              <ErrorBoundary
                component={resolver}
                loading={() => {
                  const btnId = `${id}-partial-onload`;
                  const partial = usePartialSection();

                  return (
                    <>
                      {LoadingFallback ? <LoadingFallback /> : <></>}
                      <Head>
                        <link rel="prefetch" href={partial["f-partial"]} />
                      </Head>
                      <button
                        {...partial}
                        id={btnId}
                        style={{ display: "none" }}
                      />
                      <script
                        defer
                        src={`data:text/javascript;base64,${
                          dataURI(script, btnId)
                        }`}
                      />
                    </>
                  );
                }}
                error={({ error }) =>
                  ErrorFallback ? <ErrorFallback error={error} /> : (
                    <div
                      style={Context.active().isDeploy && !debugEnabled
                        ? "display: none"
                        : undefined}
                    >
                      <p>
                        Error happened rendering {resolver}: {error.message}
                      </p>

                      <button {...usePartialSection()}>Retry</button>
                    </div>
                  )}
              >
                <ComponentFunc {...props} />
              </ErrorBoundary>
            </section>
          </Partial>
        </SectionContext.Provider>
      );
    },
  };
};
