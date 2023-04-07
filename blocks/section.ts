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
import { PromiseOrValue, UnPromisify } from "$live/engine/core/utils.ts";
import { introspectAddr } from "$live/engine/introspect.ts";
import { Schemeable, TransformContext } from "$live/engine/schema/transform.ts";
import { LoaderContext } from "$live/types.ts";
import { omit } from "$live/utils/object.ts";
import { DocNode } from "https://deno.land/x/deno_doc@0.58.0/lib/types.d.ts";
import { JSX } from "preact";

export type Section = InstanceOf<typeof sectionBlock, "#/root/sections">;

export interface SectionModule<TConfig = any, TProps = any> extends
  BlockModule<
    ComponentFunc<TProps>,
    JSX.Element | null,
    PreactComponent
  > {
  loadData?: (
    req: Request,
    ctx: LoaderContext<LiveConfig<TConfig, any>>,
  ) => PromiseOrValue<Partial<TProps>>;
}

const omitIfObj = (schemeable: Schemeable, omitKeys: string[]): Schemeable => {
  if (schemeable.type !== "object" || omitKeys.length === 0) {
    return schemeable;
  }
  return {
    ...schemeable,
    name: schemeable.name
      ? `omit${btoa(omitKeys.join())}${schemeable.name}`
      : undefined,
    value: omit(schemeable.value, ...omitKeys),
  };
};

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
  introspect: async (
    ctx: TransformContext,
    path: string,
    ast: DocNode[],
  ): Promise<BlockModuleRef | undefined> => {
    const [defaultFuncProps, loadData] = await Promise.all([
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
          loadData: ["1", "state.$live"],
        },
        ctx,
        path,
        ast,
        true, // includereturn
      ),
    ]);
    if (!loadData) {
      return defaultFuncProps;
    }
    if (!defaultFuncProps) {
      return undefined;
    }
    const returnKeys =
      loadData.outputSchema && loadData.outputSchema.type === "object"
        ? Object.keys(loadData.outputSchema.value)
        : [];

    return {
      ...defaultFuncProps,
      inputSchema: defaultFuncProps.inputSchema && loadData.inputSchema
        ? {
          file: defaultFuncProps.inputSchema.file,
          name:
            `${defaultFuncProps.inputSchema.name}&${loadData.inputSchema.name}`,
          type: "intersection",
          value: [
            omitIfObj(defaultFuncProps.inputSchema, returnKeys),
            loadData.inputSchema,
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
    | Resolver<
      PreactComponent,
      & TConfig
      & Omit<
        TProps,
        keyof UnPromisify<ReturnType<Required<SectionModule>["loadData"]>> // everything except the returned by loadData func
      >,
      HttpContext
    > => {
    const componentFunc = componentWith(resolver, mod.default);
    const loadDataFunc = mod.loadData;
    if (!loadDataFunc) {
      return (
        props: TProps,
        { resolveChain }: BaseContext,
      ): PreactComponent<any, TProps> => componentFunc(props, resolveChain);
    }
    return async (
      props:
        & TConfig
        & Omit<
          TProps,
          keyof UnPromisify<ReturnType<Required<SectionModule>["loadData"]>>
        >,
      { resolveChain, request, context, resolve }: HttpContext,
    ): Promise<PreactComponent<any, TProps>> => {
      const ctx = context as HandlerContext;
      const resp = await loadDataFunc(request, {
        ...ctx,
        state: { ...ctx.state, $live: props, resolve },
      });
      return componentFunc({ ...props, ...resp } as TProps, resolveChain);
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
