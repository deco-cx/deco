// deno-lint-ignore-file no-explicit-any
import type { ComponentType } from "preact";
import type { HttpContext } from "../blocks/handler.ts";
import { type PropsLoader, propsLoader } from "../blocks/propsLoader.ts";
import {
  fnContextFromHttpContext,
  type RequestState,
} from "../blocks/utils.tsx";
import StubSection, { Empty } from "../components/StubSection.tsx";
import { alwaysThrow, withSection } from "../components/section.tsx";
import { Context } from "../deco.ts";
import type { JSX } from "../deps.ts";
import type {
  Block,
  BlockModule,
  ComponentFunc,
  InstanceOf,
  PreactComponent,
} from "../engine/block.ts";
import type { Resolver } from "../engine/core/resolver.ts";
import type { AppManifest, FunctionContext } from "../types.ts";

/**
 * @widget none
 */
export type Section<
  _TSectionReturn extends JSX.Element | null = JSX.Element | null,
> = InstanceOf<typeof sectionBlock, "#/root/sections">;

export const isSection = <
  TManifest extends AppManifest = AppManifest,
  K extends keyof TManifest["sections"] = keyof TManifest["sections"],
  Sec extends TManifest["sections"][K] extends
    { default: ComponentFunc<infer Props> } ? PreactComponent<
      Props
    >
    : unknown = TManifest["sections"][K] extends
      { default: ComponentFunc<infer Props> } ? PreactComponent<
        Props
      >
      : unknown,
>(
  s: Sec | Section,
  section: K | string,
): s is Sec => {
  return (s as Section)?.metadata?.component === section;
};

type ReturnProps<TFunc> = TFunc extends PropsLoader<any, infer Props> ? Props
  : unknown;

export type SectionProps<LoaderFunc, ActionFunc = LoaderFunc> =
  | ReturnProps<LoaderFunc>
  | ReturnProps<ActionFunc>;

export interface ErrorBoundaryParams<TProps> {
  error: any;
  props: TProps;
}

export type ErrorBoundaryComponent<TProps> = ComponentFunc<
  ErrorBoundaryParams<TProps>
>;
export interface SectionModule<
  TConfig = any,
  TProps = any,
  TLoaderProps = TProps,
  TActionProps = TLoaderProps,
> extends
  BlockModule<
    ComponentFunc<TLoaderProps | TActionProps>,
    ReturnType<ComponentFunc<TLoaderProps | TActionProps>>,
    PreactComponent
  > {
  LoadingFallback?: ComponentType;
  ErrorFallback?: ComponentType<{ error?: Error }>;
  loader?: PropsLoader<TConfig, TLoaderProps>;
  action?: PropsLoader<TConfig, TActionProps>;
}

export const createSectionBlock = (
  wrapper: typeof withSection,
  type: "sections" | "pages",
): Block<SectionModule> => ({
  type,
  introspect: {
    funcNames: ["loader", "action", "default"],
    includeReturn: true,
  },
  adapt: <TConfig = any, TProps = any>(
    mod: SectionModule<TConfig, TProps>,
    resolver: string,
  ):
    | Resolver<
      PreactComponent<TProps>,
      TProps,
      HttpContext<RequestState>
    >
    | Resolver<
      PreactComponent<TProps>,
      TConfig,
      HttpContext<RequestState>
    > => {
    const withMainComponent = (mainComponent: ComponentFunc) =>
      wrapper<TProps>(
        resolver,
        mainComponent,
        mod.LoadingFallback,
        mod.ErrorFallback,
      );
    const useExportDefaultComponent = withMainComponent(mod.default);
    if (!mod.action && !mod.loader) {
      return (
        props: TProps,
        ctx: HttpContext<RequestState>,
      ): PreactComponent<TProps> => {
        return useExportDefaultComponent(props, ctx);
      };
    }
    return async (
      props: TConfig,
      httpCtx: HttpContext<RequestState>,
    ): Promise<PreactComponent<TProps>> => {
      const {
        request,
        context,
        resolve,
      } = httpCtx;

      const loaderSectionProps = request.method === "GET"
        ? mod.loader
        : mod.action ?? mod.loader;

      if (!loaderSectionProps) {
        return useExportDefaultComponent(props as unknown as TProps, httpCtx);
      }

      const ctx = {
        ...context,
        state: { ...context.state, $live: props, resolve },
      } as FunctionContext;

      const fnContext = fnContextFromHttpContext(httpCtx);
      return await propsLoader(
        loaderSectionProps,
        ctx.state.$live,
        request,
        fnContext,
      ).then((props) => {
        return useExportDefaultComponent(props, httpCtx);
      }).catch((err) => {
        const allowErrorBoundary = withMainComponent(alwaysThrow(err));
        return allowErrorBoundary(
          ctx.state.$live as unknown as TProps,
          httpCtx,
        );
      });
    };
  },
  defaultDanglingRecover: (_, ctx) => {
    const metadata = {
      resolveChain: ctx.resolveChain,
      component: ctx.resolveChain.findLast((chain) => chain.type === "resolver")
        ?.value?.toString(),
    };
    if (Context.active().isDeploy) {
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
