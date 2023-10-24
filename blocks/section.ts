// deno-lint-ignore-file no-explicit-any
import { HttpContext } from "../blocks/handler.ts";
import { PropsLoader, propsLoader } from "../blocks/propsLoader.ts";
import { fnContextFromHttpContext, RequestState } from "../blocks/utils.tsx";
import StubSection, { Empty } from "../components/StubSection.tsx";
import { JSX } from "../deps.ts";
import {
  Block,
  BlockModule,
  ComponentFunc,
  InstanceOf,
  PreactComponent,
} from "../engine/block.ts";
import { Resolver } from "../engine/core/resolver.ts";
import { Manifest } from "../live.gen.ts";
import { context } from "../live.ts";
import { AppManifest, FunctionContext } from "../types.ts";
import { withSection } from "../components/section.tsx";

/**
 * @widget none
 */
export type Section = InstanceOf<typeof sectionBlock, "#/root/sections">;

export const isSection = <
  TManifest extends AppManifest = Manifest,
  K extends keyof TManifest["sections"] = keyof TManifest["sections"],
  Sec extends TManifest["sections"][K] extends
    { default: (props: infer Props) => JSX.Element | null } ? PreactComponent<
      JSX.Element,
      Props
    >
    : unknown = TManifest["sections"][K] extends
      { default: (props: infer Props) => JSX.Element | null } ? PreactComponent<
        JSX.Element,
        Props
      >
      : unknown,
>(
  s: Sec | Section,
  section: K,
): s is Sec => {
  return (s as Section)?.metadata?.component === section;
};

export type SectionProps<T> = T extends PropsLoader<any, infer Props> ? Props
  : unknown;

export interface ErrorBoundaryParams<TProps> {
  error: any;
  props: TProps;
}

export type ErrorBoundaryComponent<TProps> = ComponentFunc<
  ErrorBoundaryParams<TProps>
>;
export interface SectionModule<TConfig = any, TProps = any> extends
  BlockModule<
    ComponentFunc<TProps>,
    JSX.Element | null,
    PreactComponent
  > {
  ErrorBoundary?: ErrorBoundaryComponent<TProps>;
  loader?: PropsLoader<TConfig, TProps>;
}

export const createSectionBlock = (
  wrapper: typeof withSection,
  type: "sections" | "pages",
): Block<SectionModule> => ({
  type,
  introspect: { funcNames: ["loader", "default"] },
  adapt: <TConfig = any, TProps = any>(
    mod: SectionModule<TConfig, TProps>,
    resolver: string,
  ):
    | Resolver<
      PreactComponent<JSX.Element, TProps>,
      TProps,
      HttpContext<RequestState>
    >
    | Resolver<
      PreactComponent<JSX.Element, TProps>,
      TConfig,
      HttpContext<RequestState>
    > => {
    const componentFunc = wrapper(
      resolver,
      mod.default,
      mod.ErrorBoundary,
    );
    const loader = mod.loader;
    if (!loader) {
      return (
        props: TProps,
        ctx: HttpContext<RequestState>,
      ): PreactComponent<any, TProps> => {
        return componentFunc(props, ctx);
      };
    }
    return async (
      props: TConfig,
      httpCtx: HttpContext<RequestState>,
    ): Promise<PreactComponent<any, TProps>> => {
      const {
        request,
        context,
        resolve,
      } = httpCtx;

      const ctx = {
        ...context,
        state: { ...context.state, $live: props, resolve },
      } as FunctionContext;
      return componentFunc(
        await propsLoader(
          loader,
          ctx.state.$live,
          request,
          fnContextFromHttpContext(httpCtx),
        ),
        httpCtx,
      );
    };
  },
  defaultDanglingRecover: (_, ctx) => {
    const metadata = {
      resolveChain: ctx.resolveChain,
      component: ctx.resolveChain.findLast((chain) => chain.type === "resolver")
        ?.value?.toString(),
    };
    if (context.isDeploy) {
      return {
        Component: Empty,
        props: {},
        metadata,
      };
    }
    return {
      Component: StubSection,
      props: {
        component: metadata.component,
      },
      metadata,
    };
  },
  defaultPreview: (comp) => comp,
});

const sectionBlock: Block<SectionModule> = createSectionBlock(
  withSection,
  "sections",
);

/**
 * (props:TProps) => JSX.Element
 * Section are PreactComponents
 */
export default sectionBlock;
