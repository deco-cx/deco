// deno-lint-ignore-file no-explicit-any
import { HttpContext } from "$live/blocks/handler.ts";
import StubSection from "$live/components/StubSection.tsx";
import {
  Block,
  BlockModule,
  ComponentFunc,
  InstanceOf,
  PreactComponent,
} from "$live/engine/block.ts";
import { BaseContext, Resolver } from "$live/engine/core/resolver.ts";
import { DecoManifest, FunctionContext } from "$live/types.ts";
import { JSX } from "preact";
import { PropsLoader, propsLoader } from "$live/blocks/propsLoader.ts";
import type { Manifest } from "$live/live.gen.ts";
import { Empty } from "$live/components/StubSection.tsx";
import { context } from "$live/live.ts";

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

export interface SectionModule<TConfig = any, TProps = any> extends
  BlockModule<
    ComponentFunc<TProps>,
    JSX.Element | null,
    PreactComponent
  > {
  loader?: PropsLoader<TConfig, TProps>;
}

const componentWith = (
  resolver: string,
  componentFunc: ComponentFunc,
) =>
<TProps = any>(props: TProps, resolveChain: string[]) => ({
  Component: componentFunc,
  props,
  metadata: {
    component: resolver,
    resolveChain,
    id: resolveChain.length > 0 ? resolveChain[0] : undefined,
  },
});

const sectionBlock: Block<SectionModule> = {
  type: "sections",
  introspect: [{
    loader: "0",
  }, {
    default: "0",
  }],
  adapt: <TConfig = any, TProps = any>(
    mod: SectionModule<TConfig, TProps>,
    resolver: string,
  ):
    | Resolver<PreactComponent<JSX.Element, TProps>, TProps, BaseContext>
    | Resolver<
      PreactComponent<JSX.Element, TProps>,
      TConfig,
      HttpContext
    > => {
    const componentFunc = componentWith(resolver, mod.default);
    const loader = mod.loader;
    if (!loader) {
      return (
        props: TProps,
        { resolveChain }: BaseContext,
      ): PreactComponent<any, TProps> => componentFunc(props, resolveChain);
    }
    return async (
      props: TConfig,
      { resolveChain, request, context, resolve }: HttpContext,
    ): Promise<PreactComponent<any, TProps>> => {
      const ctx = {
        ...context,
        state: { ...context.state, $live: props, resolve },
      } as FunctionContext;
      return componentFunc(
        await propsLoader(loader, ctx.state.$live, request, {
          ...context?.state?.global,
          response: context.state.response,
        }),
        resolveChain,
      );
    };
  },
  defaultDanglingRecover: (_, ctx) => {
    if (context.isDeploy) {
      return {
        Component: Empty,
        props: {},
      };
    }
    return {
      Component: StubSection,
      props: {
        component: ctx.resolveChain[ctx.resolveChain.length - 1],
      },
    };
  },
  defaultPreview: (comp) => comp,
};

/**
 * (props:TProps) => JSX.Element
 * Section are PreactComponents
 */
export default sectionBlock;
