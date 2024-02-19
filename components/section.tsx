import { Partial } from "$fresh/runtime.ts";
import { HttpContext } from "deco/blocks/handler.ts";
import { HttpError } from "deco/engine/errors.ts";
import { usePartialSection } from "deco/hooks/usePartialSection.ts";
import { Component, createContext } from "preact";
import { useContext } from "preact/hooks";
import { ErrorBoundaryComponent } from "../blocks/section.ts";
import { RequestState } from "../blocks/utils.tsx";
import { Context } from "../deco.ts";
import { Murmurhash3 } from "../deps.ts";
import { ComponentFunc } from "../engine/block.ts";
import { FieldResolver } from "../engine/core/resolver.ts";
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
  ctx: HttpContext<RequestState & { renderSalt?: string }>,
) => {
  let renderCount = 0;
  const idPrefix = getSectionID(ctx.resolveChain);
  const debugEnabled = ctx.context?.state?.debugEnabled;
  const renderSaltFromState = ctx.context?.state?.renderSalt;
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
      renderCount++;
      return (
        <SectionContext.Provider
          value={{
            ...ctx,
            renderSalt,
          }}
        >
          <Partial name={id}>
            <ErrorBoundary
              component={resolver}
              fallback={(error) =>
                Fallback ? <Fallback error={error} props={props} /> : (
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
      );
    },
  };
};
