// deno-lint-ignore-file no-explicit-any
import {
  HintNode,
  ResolveHints,
  traverseAny,
} from "$live/engine/core/hints.ts";
import { ResolveOptions } from "$live/engine/core/mod.ts";
import {
  isAwaitable,
  PromiseOrValue,
  UnPromisify,
} from "$live/engine/core/utils.ts";
import { identity } from "$live/utils/object.ts";
import { createServerTimings } from "$live/utils/timings.ts";

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

export interface Monitoring {
  t: Omit<ReturnType<typeof createServerTimings>, "printTimings">;
}

export interface BaseContext {
  resolveChain: FieldResolver[];
  resolveId: string;
  resolve: ResolveFunc;
  monitoring?: Monitoring;
  resolvables: Record<string, Resolvable<any>>;
  resolvers: Record<string, Resolver>;
  danglingRecover?: Resolver;
  resolveHints: ResolveHints;
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

export type OnBeforeResolveProps = <T>(props: T) => T;
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
};

export type SyncResolver<
  T = any,
  TParent = any,
  TContext extends BaseContext = BaseContext,
> = {
  (parent: TParent, context: TContext): Resolvable<T, TContext, any>;
  onBeforeResolveProps?: OnBeforeResolveProps;
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

export const withResolveChain = <TContext extends BaseContext = BaseContext>(
  ctx: TContext,
  ...resolverType: FieldResolver[]
): TContext => {
  return {
    ...ctx,
    resolveChain: [...ctx.resolveChain, ...resolverType],
  };
};

export const ALREADY_RESOLVED = "resolved";

/**
 * wraps an arbitrary data as a resolved object skiping the config resolution algorithm.
 */
export const asResolved = <T>(data: T): T => {
  return {
    data,
    __resolveType: ALREADY_RESOLVED,
  } as T; // trust me;
};

export interface Resolved<T> {
  data: T;
  __resolveType: "resolved";
}

export const isResolved = <T>(
  resolvable: Resolvable<T> | Resolved<T>,
): resolvable is Resolved<T> => {
  return (isResolvable(resolvable)) &&
    resolvable.__resolveType === ALREADY_RESOLVED;
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
>(_props: T, hints: HintNode<T>, _ctx: TContext, nullIfDangling = false) => {
  const [_thisProps, type] = resolveTypeOf(_props);
  const onBeforeResolveProps = type && type in _ctx.resolvers
    ? _ctx.resolvers[type]?.onBeforeResolveProps ?? identity
    : identity;
  const props = onBeforeResolveProps(_thisProps as T);
  const ctx = type
    ? withResolveChain(_ctx, {
      type: type in _ctx.resolvables
        ? "resolvable"
        : type in _ctx.resolvers
        ? "resolver"
        : "dangling",
      value: type,
    })
    : _ctx;

  const shallow = Array.isArray(props)
    ? new Array(...props) as T
    : { ...props };
  const resolvedPropsPromise: Promise<ResolvedKey<T, keyof T>>[] = [];
  for (const [_key, hint] of Object.entries(hints)) {
    const key = _key as keyof T;
    delete shallow[key];
    if (props[key]) {
      resolvedPropsPromise.push(
        resolvePropsWithHints(
          props[key],
          hint as HintNode<T[typeof key]>,
          withResolveChain(ctx, {
            type: "prop",
            value: key.toString(),
          }),
          nullIfDangling,
        ).then((resolved) => ({ key, resolved })),
      );
    }
  }
  const resolvedProps = await Promise.all(resolvedPropsPromise);

  for (const { key, resolved } of resolvedProps) {
    shallow[key] = resolved;
  }

  if (!type) {
    return shallow;
  }

  return await resolveWithType<T>(
    type,
    shallow,
    ctx,
    nullIfDangling,
  );
};
const invokeResolverWithProps = async <
  T,
  TContext extends BaseContext = BaseContext,
>(
  props: T,
  resolver: Resolver,
  __resolveType: string,
  ctx: TContext,
): Promise<T> => {
  let end: (() => void) | undefined = undefined;

  if (isResolvable(props)) {
    delete (props as Resolvable)["__resolveType"];
  }
  let respOrPromise = resolver(
    props,
    ctx,
  );
  if (isAwaitable(respOrPromise)) {
    const timingName = __resolveType.replaceAll("/", ".");
    end = ctx.monitoring?.t?.start(timingName);
    respOrPromise = await respOrPromise;

    // (@mcandeia) there are some cases where the function returns a function. In such cases we should calculate the time to wait the inner function to return,
    // in order to achieve the correct result we should wrap the inner function with the timings function.
    if (typeof respOrPromise === "function") {
      const original = respOrPromise;
      respOrPromise = async (...args: any[]) => {
        const resp = await original(...args);
        end?.();
        return resp;
      };
    } else {
      end?.();
    }
  }
  return respOrPromise;
};

export const resolveWithType = async <
  T,
  TContext extends BaseContext = BaseContext,
>(
  resolveType: string,
  props: T,
  context: TContext,
  nullIfDangling = false,
): Promise<T> => {
  const { resolvers: resolverMap, resolvables } = context;

  if (resolveType in resolvables) {
    return resolveResolvable(resolveType, context, nullIfDangling);
  } else if (resolveType in resolverMap) {
    return invokeResolverWithProps(
      props,
      resolverMap[resolveType],
      resolveType,
      context,
    );
  }

  const ctx = withResolveChain(context, {
    type: "dangling",
    value: resolveType,
  });

  if (nullIfDangling) {
    return Promise.resolve(null as T);
  }

  if (!ctx.danglingRecover) {
    throw new DanglingReference(resolveType);
  }
  return ctx.danglingRecover(
    isPropsResolver(props) ? await props() : props,
    ctx,
  );
};

const resolveResolvable = <
  T,
  TContext extends BaseContext = BaseContext,
>(
  resolveType: string,
  context: TContext,
  nullIfDangling = false,
): Promise<T> => {
  const {
    resolvables: { [resolveType]: resolvableObj },
  } = context;

  const hints = context.resolveHints[resolveType] ??= traverseAny(
    resolvableObj,
  );

  return resolveAny(resolvableObj, context, nullIfDangling, hints);
};

export type PropsResolver<T> = (
  onBeforeResolveProps?: OnBeforeResolveProps,
) => PromiseOrValue<T>;

const isPropsResolver = <T>(
  propsResolver: T | PropsResolver<T>,
): propsResolver is PropsResolver<T> => {
  return propsResolver && typeof propsResolver === "function";
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
  nullIfDangling = false,
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
    nullIfDangling,
  );
};

export const resolve = <
  T,
  TContext extends BaseContext = BaseContext,
>(
  maybeResolvable: string | Resolvable<T, TContext>,
  context: TContext,
  nullIfDangling = false,
): Promise<T> => {
  if (
    typeof maybeResolvable === "string"
  ) {
    return resolveWithType(
      maybeResolvable,
      {} as T,
      context,
      nullIfDangling,
    );
  }
  return resolveAny<T>(maybeResolvable, context, nullIfDangling);
};
