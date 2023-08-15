// deno-lint-ignore-file no-explicit-any
import { HttpContext } from "$live/blocks/handler.ts";
import { PropsLoader, propsLoader } from "$live/blocks/propsLoader.ts";
import {
  componentWith,
  fnContextFromHttpContext,
} from "$live/blocks/utils.tsx";
import StubSection, { Empty } from "$live/components/StubSection.tsx";
import {
  Block,
  BlockModule,
  ComponentFunc,
  InstanceOf,
  PreactComponent,
} from "$live/engine/block.ts";
import { Resolver } from "$live/engine/core/resolver.ts";
import type { Manifest } from "$live/live.gen.ts";
import { context } from "$live/live.ts";
import { DecoManifest, FunctionContext } from "$live/types.ts";
import { JSX } from "preact";

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
  TManifest extends DecoManifest = Manifest,
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
