// deno-lint-ignore-file no-explicit-any
import { HandlerContext } from "$fresh/server.ts";
import { HttpContext, LiveConfig } from "$live/blocks/handler.ts";
import StubSection from "$live/components/StubSection.tsx";
import {
  Block,
  BlockModule,
  ComponentFunc,
  InstanceOf,
  PreactComponent,
} from "$live/engine/block.ts";
import { BaseContext, Resolver } from "$live/engine/core/resolver.ts";
import { PromiseOrValue } from "$live/engine/core/utils.ts";
import { JSX } from "preact";

export type Section = InstanceOf<typeof sectionBlock, "#/root/sections">;

export interface SectionModule<TConfig = any, TProps = any> extends
  BlockModule<
    ComponentFunc<TProps>,
    JSX.Element | null,
    PreactComponent
  > {
  getProps?: (
    req: Request,
    ctx: HandlerContext<any, LiveConfig<TConfig, any>>,
  ) => PromiseOrValue<TProps>;
}

const sectionBlock: Block<SectionModule> = {
  type: "sections",
  introspect: [{
    getProps: ["1", "state.$live"],
  }, {
    default: "0",
  }],
  adapt: <TConfig = any, TProps = any>(
    mod: SectionModule<TConfig, TProps>,
    resolver: string,
  ):
    | Resolver<PreactComponent, TProps, BaseContext>
    | Resolver<PreactComponent, TConfig, HttpContext> => {
    const propsFunc = mod.getProps;
    if (!propsFunc) {
      return (
        props: TProps,
        { resolveChain }: BaseContext,
      ): PreactComponent<any, TProps> => ({
        Component: mod.default,
        props,
        metadata: {
          component: resolver,
          resolveChain,
          id: resolveChain.length > 0 ? resolveChain[0] : undefined,
        },
      });
    }
    return async (
      props: TConfig,
      { resolveChain, request, context, resolve }: HttpContext,
    ): Promise<PreactComponent<any, TProps>> => {
      const ctx = context as HandlerContext;
      return ({
        Component: mod.default,
        props: await propsFunc(request, {
          ...ctx,
          state: { ...ctx.state, $live: props, resolve },
        }),
        metadata: {
          component: resolver,
          resolveChain,
          id: resolveChain.length > 0 ? resolveChain[0] : undefined,
        },
      });
    };
  },
  defaultDanglingRecover: (_, ctx) => {
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
