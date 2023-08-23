// deno-lint-ignore-file no-explicit-any
import type { AppManifest, SourceMap } from "../blocks/app.ts";
import type { InvocationFunc } from "../clients/withManifest.ts";
import { Component, JSX } from "../deps.ts";
import {
  Block,
  BlockModule,
  ComponentFunc,
  PreactComponent,
} from "../engine/block.ts";
import {
  FieldResolver,
  ResolveFunc,
  Resolver,
} from "../engine/core/resolver.ts";
import { PromiseOrValue, singleFlight } from "../engine/core/utils.ts";
import { HttpError } from "../engine/errors.ts";
import { ResolverMiddlewareContext } from "../engine/middleware.ts";
import type { Manifest } from "../live.gen.ts";
import { context } from "../live.ts";
import { HttpContext } from "./handler.ts";
import { ErrorBoundaryComponent } from "./section.ts";

export type SingleFlightKeyFunc<TConfig = any, TCtx = any> = (
  args: TConfig,
  ctx: TCtx,
) => string;

export const applyConfig = <
  TConfig = any,
  TResp = any,
  TFunc extends (c: TConfig) => TResp = any,
>(func: {
  default: TFunc;
}) =>
async ($live: TConfig) => {
  return await func.default($live);
};

export const applyConfigSync = <
  TConfig = any,
  TResp = any,
  TFunc extends (c: TConfig) => TResp = any,
>(func: {
  default: TFunc;
}) =>
($live: TConfig) => {
  return func.default($live);
};

export const applyConfigFunc = <
  TConfig = any,
  TResp extends (...args: any[]) => any = any,
  TFunc extends (c: TConfig) => TResp = any,
>(func: {
  default: TFunc;
}) =>
async ($live: TConfig) => {
  const resp = await func.default($live);
  return typeof resp === "function" ? resp : () => resp;
};

export type FnContext<
  // deno-lint-ignore ban-types
  TState = {},
  TManifest extends AppManifest = Manifest,
> = TState & {
  response: { headers: Headers };
  get: ResolveFunc;
  invoke: InvocationFunc<TManifest>;
};

export type FnProps<
  TProps = any,
  TResp = any,
  TState = any,
> = (
  props: TProps,
  request: Request,
  ctx: FnContext<TState>,
) => PromiseOrValue<TResp>;

// deno-lint-ignore ban-types
export const fnContextFromHttpContext = <TState = {}>(
  ctx: HttpContext<{ global?: any; response?: { headers: Headers } }>,
): FnContext<TState> => {
  return {
    ...ctx?.context?.state?.global,
    get: ctx.resolve,
    response: ctx.context.state.response,
    invoke: ctx.context.state.invoke,
  };
};
export const applyProps = <
  TProps = any,
  TResp = any,
>(func: {
  default: FnProps<TProps, TResp>;
}) =>
(
  $live: TProps,
  ctx: HttpContext<{ global: any; response: { headers: Headers } }>,
) => { // by default use global state
  return func.default(
    $live,
    ctx.request,
    fnContextFromHttpContext(ctx),
  );
};

class ErrorBoundary
  extends Component<{ fallback: ComponentFunc<any>; component: string }> {
  state = { error: null };

  static getDerivedStateFromError(error: any) {
    if (error instanceof HttpError) {
      throw error;
    }
    return { error };
  }

  render() {
    if (this.state.error) {
      console.error(
        `rendering error ${this.props.component}:`,
        this.state.error,
      );
    }
    return this.state.error
      ? this.props.fallback(this.state.error)
      : this.props.children;
  }
}

export const componentWith = <TProps = any>(
  resolver: string,
  ComponentFunc: ComponentFunc,
  errBoundary?: ErrorBoundaryComponent<TProps>,
) =>
(
  props: TProps,
  { resolveChain }: { resolveChain: FieldResolver[] },
  debugEnabled?: boolean,
) => ({
  Component: (props: TProps) => {
    return (
      <ErrorBoundary
        component={resolver}
        fallback={(error) =>
          errBoundary ? errBoundary({ error, props }) : (
            <p
              style={context.isDeploy && !debugEnabled
                ? "display: none"
                : undefined}
            >
              Error happened rendering {resolver}: {error.message}
            </p>
          )}
      >
        <ComponentFunc {...props} />
      </ErrorBoundary>
    );
  },
  props,
  metadata: {
    component: resolver,
    resolveChain,
  },
});

export const fromComponentFunc: Block["adapt"] = <TProps = any>(
  { default: Component }: { default: ComponentFunc<TProps> },
  component: string,
): Resolver => componentWith<TProps>(component, Component);

export const usePreviewFunc = <TProps = any>(
  Component: ComponentFunc<TProps>,
): Resolver =>
(component: PreactComponent<any, TProps>): PreactComponent<any, TProps> => ({
  ...component,
  Component,
});

export const newComponentBlock = <K extends string>(
  type: K,
  defaultDanglingRecover?: Resolver<PreactComponent> | Resolver<
    PreactComponent
  >[],
): Block<
  BlockModule<ComponentFunc, JSX.Element | null, PreactComponent>,
  ComponentFunc,
  K
> => ({
  type,
  defaultDanglingRecover,
  defaultPreview: (comp) => comp,
  adapt: fromComponentFunc,
});

export const newSingleFlightGroup = <
  TConfig = any,
  TContext extends ResolverMiddlewareContext<any> = ResolverMiddlewareContext<
    any
  >,
>(singleFlightKeyFunc?: SingleFlightKeyFunc<TConfig, TContext>) => {
  const flights = singleFlight();
  return (c: TConfig, ctx: TContext) => {
    if (!singleFlightKeyFunc) {
      return ctx.next!();
    }
    return flights.do(
      `${singleFlightKeyFunc(c, ctx)}`,
      () => ctx.next!(),
    );
  };
};

export const buildSourceMapWith = (
  manifest: AppManifest,
  sourceMapBuilder: (str: string) => string,
): SourceMap => {
  const sourceMap: SourceMap = {};
  const { baseUrl: _ignoreBaseUrl, name: _ignoreName, ...appManifest } =
    manifest;
  for (const value of Object.values(appManifest)) {
    for (const blockKey of Object.keys(value)) {
      sourceMap[blockKey] = sourceMapBuilder(blockKey);
    }
  }

  return sourceMap;
};

export const buildSourceMap = (manifest: AppManifest): SourceMap => {
  const { baseUrl, name } = manifest;
  const builder = (blockKey: string) =>
    blockKey.replace(
      `${name}/`,
      new URL("./", baseUrl).href,
    );
  return buildSourceMapWith(manifest, builder);
};
