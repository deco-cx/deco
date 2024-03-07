// deno-lint-ignore-file no-explicit-any
import { ComponentType } from "preact";
import { HttpContext } from "../blocks/handler.ts";
import { PropsLoader, propsLoader } from "../blocks/propsLoader.ts";
import { fnContextFromHttpContext, RequestState } from "../blocks/utils.tsx";
import StubSection, { Empty } from "../components/StubSection.tsx";
import { withSection } from "../components/section.tsx";
import { Context } from "../deco.ts";
import { JSX } from "../deps.ts";
import {
  Block,
  BlockModule,
  ComponentFunc,
  InstanceOf,
  PreactComponent,
} from "../engine/block.ts";
import { Resolver } from "../engine/core/resolver.ts";
import { AppManifest, FunctionContext } from "../types.ts";
import { HttpError } from "../engine/errors.ts";

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
    ReturnType<ComponentFunc<TProps>>,
    PreactComponent
  > {
  LoadingFallback?: ComponentType;
  ErrorFallback?: ComponentType<{ error?: Error }>;
  loader?: PropsLoader<TConfig, TProps>;
}

const wrapCaughtErrors = async <TProps>(
  cb: () => Promise<TProps>,
  props: any,
) => {
  try {
    return await cb();
  } catch (err) {
    if (err instanceof HttpError) {
      throw err;
    }
    return Object.fromEntries(
      Object.keys(props).map((p) => [
        p,
        new Proxy({}, {
          get: (_target, prop) => {
            if (prop === "__resolveType") {
              return undefined;
            }
            if (prop === "constructor") {
              return undefined;
            }
            if (prop === "__isErr") {
              return true;
            }
            throw err;
          },
        }),
      ]),
    ) as TProps;
  }
};

export const createSectionBlock = (
  wrapper: typeof withSection,
  type: "sections" | "pages",
): Block<SectionModule> => ({
  type,
  introspect: { funcNames: ["loader", "default"], includeReturn: ["default"] },
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
    const componentFunc = wrapper<TProps>(
      resolver,
      mod.default,
      mod.LoadingFallback,
      mod.ErrorFallback,
    );
    const loader = mod.loader;
    if (!loader) {
      return (
        props: TProps,
        ctx: HttpContext<RequestState>,
      ): PreactComponent<TProps> => {
        return componentFunc(props, ctx);
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

      const ctx = {
        ...context,
        state: { ...context.state, $live: props, resolve },
      } as FunctionContext;

      const p = await wrapCaughtErrors(() =>
        propsLoader(
          loader,
          ctx.state.$live,
          request,
          fnContextFromHttpContext(httpCtx),
        ), props ?? {});

      return componentFunc(p, httpCtx);
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
