// deno-lint-ignore-file no-explicit-any
import { HttpContext } from "../blocks/handler.ts";
import { PropsLoader, propsLoader } from "../blocks/propsLoader.ts";
import { componentWith, fnContextFromHttpContext } from "../blocks/utils.tsx";
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
import { context } from "../live.ts";
import { AppManifest, FunctionContext } from "../types.ts";

/**
 * @widget none
 */
export type Section = InstanceOf<typeof sectionBlock, "#/root/sections">;

export const isSection = <
  K extends keyof TManifest["sections"],
  Sec extends TManifest["sections"][K] extends
    { default: (props: infer Props) => JSX.Element | null } ? PreactComponent<
      JSX.Element,
      Props
    >
    : unknown,
  TManifest extends AppManifest = AppManifest,
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

const sectionBlock: Block<SectionModule> = {
  type: "sections",
  introspect: { funcNames: ["loader", "default"] },
  adapt: <TConfig = any, TProps = any>(
    mod: SectionModule<TConfig, TProps>,
    resolver: string,
  ):
    | Resolver<PreactComponent<JSX.Element, TProps>, TProps, HttpContext>
    | Resolver<
      PreactComponent<JSX.Element, TProps>,
      TConfig,
      HttpContext
    > => {
    const errBoundary = mod.ErrorBoundary;
    const componentFunc = componentWith(resolver, mod.default, errBoundary);
    const loader = mod.loader;
    if (!loader) {
      return (
        props: TProps,
        { resolveChain, context }: HttpContext,
      ): PreactComponent<any, TProps> => {
        return componentFunc(
          props,
          { resolveChain },
          context?.state?.debugEnabled,
        );
      };
    }
    return async (
      props: TConfig,
      httpCtx: HttpContext,
    ): Promise<PreactComponent<any, TProps>> => {
      const { resolveChain, request, context, resolve } = httpCtx;
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
        { resolveChain },
        ctx?.state?.debugEnabled,
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
};

/**
 * (props:TProps) => JSX.Element
 * Section are PreactComponents
 */
export default sectionBlock;
