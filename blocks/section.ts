import { LiveConfig } from "$live/blocks/handler.ts";
import StubSection from "$live/components/StubSection.tsx";
import {
  BlockForModule,
  BlockModule,
  ComponentFunc,
  InstanceOf,
  PreactComponent,
} from "$live/engine/block.ts";
import { Resolver } from "$live/engine/core/resolver.ts";
import { HandlerContext } from "https://deno.land/x/fresh@1.1.4/server.ts";
import { BaseContext } from "../engine/core/resolver.ts";
import { HttpContext } from "./handler.ts";

export type Section = InstanceOf<typeof sectionBlock, "#/root/sections">;

export interface SectionModuleWithoutStaticProps<
  // deno-lint-ignore no-explicit-any
  TProps = any,
> extends BlockModule {
  default: ComponentFunc<TProps>;
}

export interface SectionModuleWithStaticProps<
  // deno-lint-ignore no-explicit-any
  TConfig = any,
  // deno-lint-ignore no-explicit-any
  TProps = any,
> extends BlockModule {
  getStaticProps: (
    req: Request,
    // deno-lint-ignore no-explicit-any
    ctx: HandlerContext<any, LiveConfig<TConfig, any>>,
  ) => Promise<TProps>;
  default: ComponentFunc<TProps>;
}

const hasStaticProps = (
  mod: SectionModule,
): mod is SectionModuleWithStaticProps => {
  return (mod as SectionModuleWithStaticProps)?.getStaticProps !== undefined;
};
// deno-lint-ignore no-explicit-any
export type SectionModule<TConfig = any, TProps = any> =
  | SectionModuleWithStaticProps<TConfig, TProps>
  | SectionModuleWithoutStaticProps<TProps>;

const sectionBlock: BlockForModule<SectionModule> = {
  type: "sections",
  introspect: [{
    getStaticProps: ["1", "state.$live"],
  }, {
    default: "0",
  }],
  // deno-lint-ignore no-explicit-any
  adapt: <TConfig = any, TProps = any>(
    mod: SectionModule<TConfig, TProps>,
    resolver: string,
  ):
    | Resolver<PreactComponent, TProps, BaseContext>
    | Resolver<PreactComponent, TConfig, HttpContext> => {
    if (!hasStaticProps(mod)) {
      return (
        props: TProps,
        { resolveChain }: BaseContext,
        // deno-lint-ignore no-explicit-any
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
      // deno-lint-ignore no-explicit-any
    ): Promise<PreactComponent<any, TProps>> => {
      const ctx = context as HandlerContext;
      return ({
        Component: mod.default,
        props: await mod.getStaticProps(request, {
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
