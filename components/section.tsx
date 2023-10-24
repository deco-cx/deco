import { Partial } from "$fresh/runtime.ts";
import { HttpContext } from "deco/blocks/handler.ts";
import { HttpError } from "deco/engine/errors.ts";
import { usePartialSection } from "deco/hooks/usePartialSection.ts";
import { Component, createContext } from "preact";
import { ErrorBoundaryComponent } from "../blocks/section.ts";
import { RequestState } from "../blocks/utils.tsx";
import { Murmurhash3 } from "../deps.ts";
import { ComponentFunc } from "../engine/block.ts";
import { FieldResolver } from "../engine/core/resolver.ts";
import { context } from "../live.ts";
import { logger } from "../observability/otel/config.ts";

interface SectionContext {
  resolveChain: FieldResolver[];
  request: Request;
  pathTemplate: string;
}

export const SectionContext = createContext<
  HttpContext<RequestState> | undefined
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

export class ErrorBoundary
  extends Component<{ fallback: ComponentFunc<any>; component: string }> {
  state = { error: null };

  static getDerivedStateFromError(error: any) {
    if (error instanceof HttpError) {
      throw error;
    }
    return { error };
  }

  render() {
    if (this.state.error) {
      const err = this?.state?.error as Error;
      const msg = `rendering: ${this.props.component} ${err?.stack}`;
      logger.error(
        msg,
      );
      console.error(
        msg,
      );
    }
    return this.state.error
      ? this.props.fallback(this.state.error)
      : this.props.children;
  }
}

export const withSection = <TProps,>(
  resolver: string,
  ComponentFunc: ComponentFunc,
  Fallback?: ErrorBoundaryComponent<TProps>,
) =>
(
  props: TProps,
  ctx: HttpContext<RequestState>,
) => {
  const id = getSectionID(ctx.resolveChain);
  const debugEnabled = ctx.context?.state?.debugEnabled;

  return {
    props,
    Component: (props: TProps) => (
      <SectionContext.Provider value={ctx}>
        <Partial name={id}>
          <ErrorBoundary
            component={resolver}
            fallback={(error) =>
              Fallback ? <Fallback error={error} props={props} /> : (
                <div
                  style={context.isDeploy && !debugEnabled
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
            <section
              id={id}
              data-manifest-key={resolver}
              data-resolve-chain={isPreview(ctx.resolveChain)
                ? JSON.stringify(ctx.resolveChain)
                : undefined}
            >
              <ComponentFunc {...props} />
            </section>
          </ErrorBoundary>
        </Partial>
      </SectionContext.Provider>
    ),
  };
};
