// deno-lint-ignore-file no-explicit-any
import type { ComponentType } from "preact";
import type { HttpContext } from "../blocks/handler.ts";
import { type PropsLoader, propsLoader } from "../blocks/propsLoader.ts";
import {
  fnContextFromHttpContext,
  type RequestState,
} from "../blocks/utils.tsx";
import StubSection, { Empty } from "../components/StubSection.tsx";
import { withSection } from "../components/section.tsx";
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

            /**
             * This proxy may be used inside islands.
             * Islands props are serialized by fresh's serializer.
             * This code makes it behave well with fresh's serializer
             */
            if (prop === "peek") {
              return undefined;
            }
            if (prop === "toJSON") {
              return () => null;
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
    const componentFunc = wrapper<TProps>(
      resolver,
      mod.default,
      mod.LoadingFallback,
      mod.ErrorFallback,
    );
    if (!mod.action && !mod.loader) {
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

      const loaderSectionProps = request.method === "GET"
        ? mod.loader
        : mod.action ?? mod.loader;

      if (!loaderSectionProps) {
        return componentFunc(props as unknown as TProps, httpCtx);
      }

      const ctx = {
        ...context,
        state: { ...context.state, $live: props, resolve },
      } as FunctionContext;

      const fnContext = fnContextFromHttpContext(httpCtx);
      const p = await wrapCaughtErrors(() =>
        propsLoader(
          loaderSectionProps,
          ctx.state.$live,
          request,
          fnContext,
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
