/** @jsxRuntime automatic */
/** @jsxImportSource preact */

// deno-lint-ignore-file no-explicit-any
import type { StatusCode as Status } from "@std/http/status";
import type { JSX } from "preact";
import type { AppManifest, ImportMap } from "../blocks/app.ts";
import { isInvokeCtx } from "../blocks/loader.ts";
import type { InvocationFunc } from "../clients/withManifest.ts";
import { withSection } from "../components/section.tsx";
import type {
  Block,
  BlockModule,
  ComponentFunc,
  PreactComponent,
} from "../engine/block.ts";
import type {
  Monitoring,
  ResolveFunc,
  Resolver,
} from "../engine/core/resolver.ts";
import { type PromiseOrValue, singleFlight } from "../engine/core/utils.ts";
import type { ResolverMiddlewareContext } from "../engine/middleware.ts";
import type { Flag } from "../types.ts";
import { buildInvokeFunc } from "../utils/invoke.server.ts";
import type { InvocationProxy } from "../utils/invoke.types.ts";
import { type Device, deviceOf, isBot as isUABot } from "../utils/userAgent.ts";
import type { HttpContext } from "./handler.ts";

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

/**
 * Creates a unique bag key for the given description
 * @param description the description of the key
 * @returns a symbol that can be used as a bag key
 */
export const createBagKey = (description: string): symbol =>
  Symbol(description);

interface Vary {
  push: (...key: string[]) => void;
  build: () => string;
  shouldCache: boolean;
}

export const vary = (): Vary => {
  const vary: string[] = [];

  return {
    push: (...key: string[]) => vary.push(...key),
    build: () => {
      return vary.sort().join();
    },
    shouldCache: true,
  };
};

/**
 * Values that are fulfilled for every request
 */
export interface RequestState {
  vary: Vary;
  response: {
    headers: Headers;
    status?: Status;
  };
  bag: WeakMap<any, any>;
  flags: Flag[];
}

export type FnContext<
  // deno-lint-ignore ban-types
  TState = {},
  TManifest extends AppManifest = AppManifest,
> = TState & RequestState & {
  revision: string;
  device: Device;
  isBot: boolean;
  resolverId?: string;
  monitoring?: Monitoring;
  get: ResolveFunc;
  isInvoke?: boolean;
  invoke:
    & InvocationProxy<
      TManifest
    >
    & InvocationFunc<TManifest>;
};

export type FnProps<
  TProps = any,
  TResp = any,
  TState = any,
  TRequest = Request,
> = (
  props: TProps,
  request: TRequest,
  ctx: FnContext<TState>,
) => PromiseOrValue<TResp>;

export type AppHttpContext = HttpContext<
  { global?: any } & RequestState
>;
// deno-lint-ignore ban-types
export const fnContextFromHttpContext = <TState = {}>(
  ctx: AppHttpContext,
): FnContext<TState> => {
  let device: Device | null = null;
  let isBot: boolean | null = null;

  return {
    ...ctx?.context?.state?.global,
    revision: ctx.revision,
    resolverId: ctx.resolverId,
    monitoring: ctx.monitoring,
    get: ctx.resolve,
    response: ctx.context.state.response,
    bag: ctx.context.state.bag,
    isInvoke: isInvokeCtx(ctx),
    invoke: buildInvokeFunc(ctx.resolve, { propagateOptions: true }, {
      isInvoke: true,
      resolveChain: ctx.resolveChain,
    }),
    get device() {
      return device ??= deviceOf(ctx.request);
    },
    get isBot() {
      return isBot ??= isUABot(ctx.request);
    },
  };

};
/**
 *  Applies the given props to the target block function.
 *
 * @template TProps, TResp
 * @param {Object} func - A function with a `default` property.
 * @param {TProps} $live - Props to be applied to the function.
 * @param {HttpContext<{ global: any } & RequestState>} ctx - A context object containing global state and request information.
 * @returns {PromiseOrValue<TResp>} The result of the function call with the applied props.
 */
export const applyProps = <
  TProps = any,
  TResp = any,
>(func: {
  default: FnProps<TProps, TResp>;
}) =>
(
  $live: TProps,
  ctx: HttpContext<{ global: any } & RequestState>,
): PromiseOrValue<TResp> => { // by default use global state
  return func.default(
    $live,
    ctx.request,
    fnContextFromHttpContext(ctx),
  );
};

export const fromComponentFunc: Block["adapt"] = <TProps = any>(
  { default: Component }: { default: ComponentFunc<TProps> },
  component: string,
) => withSection<TProps>(component, Component);

const isPreactComponent = (
  v: unknown | PreactComponent,
): v is PreactComponent => {
  return typeof (v as PreactComponent).Component === "function";
};
export const usePreviewFunc = <TProps = any>(
  Component: ComponentFunc<TProps>,
): Resolver =>
(component: PreactComponent<TProps>): PreactComponent<TProps> => {
  return ({
    ...isPreactComponent(component) ? component : { props: component },
    Component,
  });
};

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

export const buildImportMapWith = (
  manifest: AppManifest,
  importMapBuilder: (str: string) => string,
): ImportMap => {
  const importMap: ImportMap = { imports: {} };
  const { baseUrl: _ignoreBaseUrl, name: _ignoreName, ...appManifest } =
    manifest;
  for (const value of Object.values(appManifest)) {
    for (const blockKey of Object.keys(value)) {
      importMap.imports[blockKey] = importMapBuilder(blockKey);
    }
  }

  return importMap;
};

export const buildImportMap = (manifest: AppManifest): ImportMap => {
  const { baseUrl, name } = manifest;
  if (!URL.canParse("./", baseUrl)) {
    return {
      imports: {},
    };
  }
  const builder = (blockKey: string) =>
    blockKey.replace(
      `${name}/`,
      new URL("./", baseUrl).href,
    );
  return buildImportMapWith(manifest, builder);
};
