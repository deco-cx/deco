// deno-lint-ignore-file no-explicit-any
import { Context, Span, Tracer } from "../../deps.ts";
import { identity } from "../../utils/object.ts";
import { createServerTimings } from "../../utils/timings.ts";
import { HintNode, ResolveHints, traverseAny } from "./hints.ts";
import { ResolveOptions, resolverIdFromResolveChain } from "./mod.ts";
import {
  isAwaitable,
  notUndefined,
  PromiseOrValue,
  UnPromisify,
} from "./utils.ts";

export class DanglingReference extends Error {
  public resolverType: string;
  constructor(resolverType: string) {
    super(`Dangling reference of: ${resolverType}`);
    this.resolverType = resolverType;
  }
}
export type ResolveFunc = <T = any, TContext extends BaseContext = BaseContext>(
  data: string | Resolvable<T>,
  options?: Partial<ResolveOptions>,
  partialCtx?: Partial<Omit<TContext, keyof BaseContext>>,
) => Promise<T>;

export type ObserveFunc = <T>(
  key: string,
  func: () => Promise<T>,
) => Promise<T>;

type ServerTiming = Omit<
  ReturnType<typeof createServerTimings>,
  "printTimings"
>;

export interface Monitoring {
  timings: ServerTiming;
  metrics: ObserveFunc;
  tracer: Tracer;
  context: Context;
  logger: typeof console;
  rootSpan?: Span;
  currentSpan?: ReturnType<ServerTiming["start"]>;
}

export interface BaseContext {
  resolveChain: FieldResolver[];
  resolveId: string;
  resolverId: string;
  resolve: ResolveFunc;
  monitoring?: Monitoring;
  resolvables: Record<string, Resolvable<any>>;
  resolvers: Record<string, Resolver>;
  danglingRecover?: Resolver;
  resolveHints: ResolveHints;
  memo: Record<string, any>;
  runOnce: <T>(key: string, f: () => PromiseOrValue<T>) => PromiseOrValue<T>;
}

export interface PropFieldResolver {
  value: string | number;
  type: "prop";
}

export interface ResolvableFieldResolver {
  value: string;
  type: "resolvable";
}

export interface ResolverFieldResolver {
  value: string;
  type: "resolver";
}
export interface DanglingFieldResolver {
  value: string;
  type: "dangling";
}
export type FieldResolver =
  | PropFieldResolver
  | ResolvableFieldResolver
  | ResolverFieldResolver
  | DanglingFieldResolver;

export type ResolveChain = FieldResolver[];
export type ResolvesTo<
  T,
  TContext extends BaseContext = BaseContext,
  TResolverMap extends ResolverMap<TContext> = ResolverMap<TContext>,
> = {
  [resolver in keyof TResolverMap]: UnPromisify<
    ReturnType<TResolverMap[resolver]>
  > extends T ? TResolverMap[resolver]
    : never;
};

const RESOLVE_TYPES: FieldResolver["type"][] = [
  "prop",
  "resolvable",
  "resolver",
  "dangling",
];

const SCORE_BY_RESOLVE_TYPES = new Map(
  Object.entries(RESOLVE_TYPES).map(([i, t]) => [t, Number(i)]),
);

export const FieldResolver = {
  minify: (chain: FieldResolver[]) => {
    const minified = [];

    for (const c of chain) {
      minified.push(SCORE_BY_RESOLVE_TYPES.get(c.type));
      minified.push(c.value);
    }

    return minified;
  },
  unwind: (minified: string[]) => {
    const unwinded: FieldResolver[] = [];

    for (let it = 0; it < minified.length; it += 2) {
      unwinded.push({
        type: RESOLVE_TYPES[Number(minified[it])],
        value: minified[it + 1],
      });
    }

    return unwinded;
  },
};

export type ResolvableObj<
  T = any,
  TContext extends BaseContext = BaseContext,
  RM extends ResolverMap<TContext> = ResolverMap<TContext>,
> = {
  [
    key in keyof Parameters<
      ResolvesTo<T, TContext, RM>[keyof ResolvesTo<T, TContext, RM>]
    >[0]
  ]: Resolvable<
    Parameters<
      ResolvesTo<T, TContext, RM>[keyof ResolvesTo<T, TContext, RM>]
    >[0][key],
    TContext,
    RM
  >;
};

type ResolveTypeOf<
  T = any,
  TContext extends BaseContext = BaseContext,
  TResolverMap extends ResolverMap<TContext> = ResolverMap<TContext>,
> = keyof ResolvesTo<T, TContext, TResolverMap>;

export type ResolvableOf<
  T,
  TContext extends BaseContext = BaseContext,
  TResolverMap extends ResolverMap<TContext> = ResolverMap<TContext>,
  ResolvableMap extends Record<
    string,
    Resolvable<any, TContext, TResolverMap>
  > = Record<string, Resolvable<any, TContext, TResolverMap>>,
> = {
  [resolvable in keyof ResolvableMap]: ResolvableMap[resolvable] extends
    Resolvable<
      T,
      TContext,
      TResolverMap
    > ? ResolvableMap[resolvable]
    : never;
};

export type Resolvable<
  T = any,
  TContext extends BaseContext = BaseContext,
  TResolverMap extends ResolverMap<TContext> = ResolverMap<TContext>,
  ResolvableMap extends Record<
    string,
    Resolvable<any, TContext, TResolverMap>
  > = Record<string, any>,
> =
  | T
  | {
    __resolveType: keyof ResolvableOf<
      T,
      TContext,
      TResolverMap,
      ResolvableMap
    >;
  }
  | (ResolvableObj<T, TContext, TResolverMap> & {
    __resolveType: ResolveTypeOf<T, TContext, TResolverMap>;
  });

export const isResolvable = <
  T = any,
  TContext extends BaseContext = BaseContext,
  TResolverMap extends ResolverMap<TContext> = ResolverMap<TContext>,
  TResolvableMap extends Record<
    string,
    Resolvable<any, TContext, TResolverMap>
  > = Record<string, any>,
>(
  v: T | Resolvable<T, TContext, TResolverMap, TResolvableMap>,
): v is Resolvable<T, TContext, TResolverMap, TResolvableMap> & {
  __resolveType: string;
} => {
  return (v as { __resolveType: string })?.__resolveType !== undefined;
};

export type OnBeforeResolveProps = <T>(props: T, hints: HintNode<T>) => T;
export type AsyncResolver<
  T = any,
  TParent = any,
  TContext extends BaseContext = BaseContext,
> = {
  (
    parent: TParent,
    context: TContext,
  ): Promise<Resolvable<T, TContext, any>>;
  onBeforeResolveProps?: OnBeforeResolveProps;
  type?: string;
};

export type SyncResolver<
  T = any,
  TParent = any,
  TContext extends BaseContext = BaseContext,
> = {
  (parent: TParent, context: TContext): Resolvable<T, TContext, any>;
  onBeforeResolveProps?: OnBeforeResolveProps;
  type?: string;
};

export type Resolver<
  T = any,
  TParent = any,
  TContext extends BaseContext = BaseContext,
> = AsyncResolver<T, TParent, TContext> | SyncResolver<T, TParent, TContext>;

export type ResolverMap<TContext extends BaseContext = BaseContext> = Record<
  string,
  Resolver<any, any, TContext>
>;

export type ResolvableMap<
  TContext extends BaseContext = BaseContext,
  TResolverMap extends ResolverMap<TContext> = ResolverMap<TContext>,
  TResolvableMap extends ResolvableMap<TContext, TResolverMap> = Record<
    string,
    any
  >,
> = Record<
  string,
  Resolvable<any, TContext, TResolverMap, TResolvableMap>
>;

export const withResolveChain = <TContext extends BaseContext = BaseContext>(
  ctx: TContext,
  ...resolverType: FieldResolver[]
): TContext => {
  return {
    ...ctx,
    resolveChain: [...ctx.resolveChain, ...resolverType],
  };
};

export const withResolveChainOfType = <
  TContext extends BaseContext = BaseContext,
>(
  ctx: TContext,
  ...resolverType: string[]
): TContext => {
  return {
    ...ctx,
    resolveChain: [
      ...ctx.resolveChain,
      ...(resolverType.map((tp) => ({
        type: tp in ctx.resolvables
          ? "resolvable"
          : tp in ctx.resolvers
          ? "resolver"
          : "dangling",
        value: tp,
      }))),
    ],
  };
};

export const RESOLVE_SHORTCIRCUIT = "resolved";

/**
 * wraps an arbitrary data as a resolved object skiping the config resolution algorithm.
 */
export const asResolved = <T>(data: T, deferred?: boolean): T => {
  return {
    data,
    deferred,
    __resolveType: RESOLVE_SHORTCIRCUIT,
  } as T; // trust me;
};

export type Deferred<T, TContext extends BaseContext = BaseContext> = {
  _deferred: true;
  __resolveType?: string;
  (
    partialCtx?: Partial<TContext>,
    opts?: Partial<ResolveOptions>,
  ): PromiseOrValue<T>;
};

export const isDeferred = <T, TContext extends BaseContext = BaseContext>(
  f: Deferred<T, TContext> | unknown,
): f is Deferred<T, TContext> => {
  return typeof f === "function" && (f as Deferred<T, TContext>)?._deferred;
};

export interface Resolved<T> {
  data: T;
  __resolveType: "resolved";
}

export const isResolved = <T>(
  resolvable: Resolvable<T> | Resolved<T>,
): resolvable is Resolved<T> => {
  return (isResolvable(resolvable)) &&
    resolvable.__resolveType === RESOLVE_SHORTCIRCUIT;
};

const resolveTypeOf = <
  T = any,
  TContext extends BaseContext = BaseContext,
  TResolverMap extends ResolverMap<TContext> = ResolverMap<TContext>,
  TResolvableMap extends Record<
    string,
    Resolvable<any, TContext, TResolverMap, TResolvableMap> | undefined
  > = Record<string, Resolvable<any, TContext, TResolverMap> | undefined>,
>(
  resolvable: Resolvable<T, TContext, TResolverMap, TResolvableMap>,
): [
  Omit<T, "__resolveType">,
  string | undefined,
] => {
  if (isResolvable(resolvable)) {
    const { __resolveType, ...rest } = resolvable;
    return [
      rest as Omit<T, "__resolveType">,
      __resolveType,
    ];
  }
  return [resolvable as Omit<T, "__resolveType">, undefined];
};

interface ResolvedKey<T, K extends keyof T> {
  key: K;
  resolved: T[K];
}

const resolvePropsWithHints = async <
  T,
  TContext extends BaseContext = BaseContext,
>(_props: T, hints: HintNode<T>, _ctx: TContext, opts: Opts) => {
  const [_thisProps, type] = resolveTypeOf(_props);
  const onBeforeResolveProps = type && type in _ctx.resolvers
    ? _ctx.resolvers[type]?.onBeforeResolveProps ?? identity
    : identity;

  const props = onBeforeResolveProps(_thisProps as T, hints);
  const ctx = type ? withResolveChainOfType(_ctx, type) : _ctx;

  const resolvedPropsPromise = Object.entries(hints).map(
    async ([_key, hint]) => {
      const key = _key as keyof T;
      if (props[key]) {
        const resolved = await resolvePropsWithHints(
          props[key],
          hint as HintNode<T[typeof key]>,
          withResolveChain(ctx, {
            type: "prop",
            value: key.toString(),
          }),
          opts,
        );
        return { key, resolved } as ResolvedKey<T, typeof key>;
      }
      return undefined;
    },
  );

  const mutableProps: T = resolvedPropsPromise.length === 0 // if there's no resolved properties so no shallow copy is needed.
    ? props
    : Array.isArray(props)
    ? [...props] as T
    : { ...props };

  const resolvedProps = await Promise.all(resolvedPropsPromise);
  for (const { key, resolved } of resolvedProps.filter(notUndefined)) {
    mutableProps[key] = resolved;
  }

  if (!type) {
    return mutableProps;
  }

  return await resolveWithType<T>(
    type,
    mutableProps,
    ctx,
    opts,
  );
};

/**
 * Invoke the given resolver with the given resolved props, calculate the timings.
 */
const invokeResolverWithProps = async <
  T,
  TContext extends BaseContext = BaseContext,
>(
  props: T,
  resolver: Resolver,
  __resolveType: string,
  ctx: TContext,
): Promise<T> => {
  if (isResolvable(props)) {
    delete (props as Resolvable)["__resolveType"];
  }

  // TODO: (@tlgimenes) create resolverId outside of the request cycle
  const resolverId = resolverIdFromResolveChain(ctx.resolveChain);
  const timing = resolverId
    ? ctx.monitoring?.timings.start(resolverId)
    : undefined;

  // Shallow copy to avoid resolvers getting the currentSpan from one another
  const monitoring = ctx.monitoring && {
    ...ctx.monitoring,
    currentSpan: timing,
  };

  let respOrPromise = resolver(
    props,
    { ...ctx, monitoring, resolverId },
  );
  if (isAwaitable(respOrPromise)) {
    await ctx?.monitoring?.tracer?.startActiveSpan?.(__resolveType, {
      attributes: {
        "block.kind": "resolver",
      },
    }, async (span) => {
      await ctx.monitoring?.metrics?.(__resolveType, async () => {
        respOrPromise = await respOrPromise;

        // (@mcandeia) there are some cases where the function returns a function. In such cases we should calculate the time to wait the inner function to return,
        // in order to achieve the correct result we should wrap the inner function with the timings function.
        if (typeof respOrPromise === "function") {
          const original = respOrPromise;
          respOrPromise = async (...args: any[]) => {
            const resp = await original(...args);
            timing?.end();
            span?.end?.();

            return resp;
          };
        } else {
          timing?.end();
          span?.end?.();
        }
        return respOrPromise;
      });
    });
  }

  return respOrPromise;
};

/**
 * Receives the props resolved and a type that should be called with the given props.
 * This type can be a resolvable which currently just ignore the resolved props and returns the given resolved resolvable.
 * If the type wasn't found, it will throw a DanglingReference or calls it recover if configured.
 */
const resolveWithType = <
  T,
  TContext extends BaseContext = BaseContext,
>(
  resolveType: string,
  props: T,
  context: TContext,
  opts: Opts,
): Promise<T> => {
  const { resolvers: resolverMap, resolvables } = context;

  if (resolveType in resolvables) {
    return context.memo[resolveType] ??= resolveResolvable<T>(
      resolveType,
      context,
      opts,
    );
  } else if (resolveType in resolverMap) {
    const resolver = resolverMap[resolveType];
    const proceed = () =>
      invokeResolverWithProps(
        props,
        resolver,
        resolveType,
        context,
      );
    return opts?.hooks?.onResolveStart?.(
      proceed,
      props,
      resolver,
      resolveType,
      context,
    ) ?? proceed();
  }

  const ctx = withResolveChain(context, {
    type: "dangling",
    value: resolveType,
  });

  if (opts.nullIfDangling) {
    opts?.hooks?.onDanglingReference?.(resolveType);
    return Promise.resolve(null as T);
  }

  if (!ctx.danglingRecover) {
    throw new DanglingReference(resolveType);
  }
  return ctx.danglingRecover(
    props,
    ctx,
  );
};

const resolveResolvable = <
  T,
  TContext extends BaseContext = BaseContext,
>(
  resolveType: string,
  context: TContext,
  opts: Opts,
): Promise<T> => {
  const {
    resolvables: { [resolveType]: resolvableObj },
  } = context;

  const hints = context.resolveHints[resolveType] ??= traverseAny(
    resolvableObj,
  ) ?? {};

  return resolveAny(
    resolvableObj,
    context,
    opts,
    hints,
  );
};

export const resolveAny = <
  T,
  TContext extends BaseContext = BaseContext,
>(
  maybeResolvable:
    | Resolvable<
      T,
      TContext
    >
    | Resolvable<T & { __resolveType: string }, TContext>,
  context: TContext,
  opts: Opts,
  hints?: HintNode<T> | null,
): Promise<T> => {
  if (!maybeResolvable) {
    return Promise.resolve(maybeResolvable);
  }
  return resolvePropsWithHints(
    maybeResolvable as T,
    hints ?? traverseAny(
      maybeResolvable,
    ) ?? {},
    context,
    opts,
  );
};

export interface ResolveHooks {
  onResolveStart?: <
    T,
    TContext extends BaseContext = BaseContext,
  >(
    resolve: () => Promise<T>,
    props: T,
    resolver: Resolver,
    __resolveType: string,
    ctx: TContext,
  ) => Promise<T>;
  onDanglingReference?: (__resolveType: string) => void;
}
/**
 * The resolve call options
 */
export interface Opts {
  nullIfDangling?: boolean;
  propsAreResolved?: boolean;
  hooks?: ResolveHooks;
}

/**
 * Receives a string (pointing to a resolvable or a resolver), a context and optionally dangling and propsAreResolved flag, and returns the resolved object.
 * See readme for more details
 */
export const resolve = <
  T,
  TContext extends BaseContext = BaseContext,
>(
  maybeResolvable: string | Resolvable<T, TContext>,
  context: TContext,
  resolveOptions: Opts = {
    nullIfDangling: false,
    propsAreResolved: false,
  },
): Promise<T> => {
  const { propsAreResolved } = resolveOptions;
  if (
    propsAreResolved && isResolvable(maybeResolvable) &&
    typeof maybeResolvable === "object"
  ) {
    const { __resolveType, ...props } = maybeResolvable;
    return resolveWithType<T>(
      __resolveType,
      props as T,
      context,
      resolveOptions,
    );
  }
  if (
    typeof maybeResolvable === "string"
  ) {
    return resolveWithType(
      maybeResolvable,
      {} as T,
      context,
      resolveOptions,
    );
  }
  return resolveAny<T>(maybeResolvable, context, resolveOptions);
};
