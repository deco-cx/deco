// deno-lint-ignore-file no-explicit-any
import { HandlerContext } from "$fresh/server.ts";
import { HttpContext, LiveConfig } from "$live/blocks/handler.ts";
import StubSection from "$live/components/StubSection.tsx";
import {
  Block,
  BlockModule,
  BlockModuleRef,
  ComponentFunc,
  InstanceOf,
  PreactComponent,
} from "$live/engine/block.ts";
import { BaseContext, Resolver } from "$live/engine/core/resolver.ts";
import { PromiseOrValue } from "$live/engine/core/utils.ts";
import { Schemeable, TransformContext } from "$live/engine/schema/transform.ts";
import { DocNode } from "https://deno.land/x/deno_doc@0.58.0/lib/types.d.ts";
import { JSX } from "preact";
import { introspectAddr } from "../engine/introspect.ts";
import { omit } from "../utils/object.ts";

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

const omitIfObj = (schemeable: Schemeable, omitKeys: string[]): Schemeable => {
  if (schemeable.type !== "object" || omitKeys.length === 0) {
    return schemeable;
  }
  return { ...schemeable, value: omit(schemeable.value, ...omitKeys) };
};
const sectionBlock: Block<SectionModule> = {
  type: "sections",
  introspect: async (
    ctx: TransformContext,
    path: string,
    ast: DocNode[],
  ): Promise<BlockModuleRef | undefined> => {
    const [defaultFuncProps, getProps] = await Promise.all([
      introspectAddr<SectionModule>(
        {
          default: "0",
        },
        ctx,
        path,
        ast,
      ),
      introspectAddr<SectionModule>(
        {
          getProps: ["1", "state.$live"],
        },
        ctx,
        path,
        ast,
        true, // includereturn
      ),
    ]);
    if (!getProps) {
      return defaultFuncProps;
    }
    if (!defaultFuncProps) {
      return undefined;
    }
    const returnKeys =
      getProps.outputSchema && getProps.outputSchema.type === "object"
        ? Object.keys(getProps.outputSchema.value)
        : [];

    return {
      ...defaultFuncProps,
      inputSchema: defaultFuncProps.inputSchema && getProps.inputSchema
        ? {
          type: "intersection",
          value: [
            omitIfObj(defaultFuncProps.inputSchema, returnKeys),
            getProps.inputSchema,
          ],
        }
        : defaultFuncProps.inputSchema,
    }; //artificial schemeable
  },
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
