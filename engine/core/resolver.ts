// deno-lint-ignore-file no-explicit-any
import {
  Hint,
  ResolveHints,
  traverseAny,
  typeOfFrom,
} from "$live/engine/core/hints.ts";
import { ResolveOptions } from "$live/engine/core/mod.ts";
import { isAwaitable, UnPromisify } from "$live/engine/core/utils.ts";
import { createServerTimings } from "$live/utils/timings.ts";

export class DanglingReference extends Error {
  public resolverType: string;
  constructor(resolverType: string) {
    super(`Dangling reference of: ${resolverType}`);
    this.resolverType = resolverType;
  }
}
export type ResolveFunc = <T = any, TContext extends BaseContext = BaseContext>(
  data: Resolvable<T>,
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

export type OnBeforeResolveProps = (props: any) => any;
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

export const withResolveChain = <T extends BaseContext = BaseContext>(
  ctx: T,
  ...resolverType: FieldResolver[]
): T => {
  const newCtx = {
    ...ctx,
    resolveChain: [...ctx.resolveChain, ...resolverType],
  };
  return {
    ...newCtx,
    resolve: function (
      data: Resolvable<T, T>,
    ): Promise<T> {
      return resolveAny<T, T>(
        data,
        newCtx as T,
      );
    },
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

/**
 * Returns the object value given its key path.
 */
export const getValue = (data: any, keys: (string | number)[]): any => {
  if (keys.length === 0 || !data) {
    return data;
  }
  const [current, ...rest] = keys;
  return getValue(data[current], rest);
};

/**
 * Returns a new data with the specified key changed to its specified @param newValue.
 * @returns the changed object. ["sections", "3"] a[sections][3] = newValue
 */
const withNewValue = (
  data: any,
  keys: (string | number)[],
  newValue: any,
): any => {
  if (!data) {
    return;
  }
  if (keys.length === 1) {
    data[keys[0]] = newValue;
    return;
  }
  const [current, ...rest] = keys;
  withNewValue(data[current], rest, newValue);
};

interface ResolvedKey {
  path: (string | number)[];
  resolved: any;
}

const resolvePropsWithHints = async <
  T,
  TContext extends BaseContext = BaseContext,
>(props: T, hints: Hint[], ctx: TContext, nullIfDangling = false) => {
  const resolvedKeysPromise: Promise<ResolvedKey>[] = [];
  for (const hint of hints) {
    const keys = hint.filter((field) => field.type === "prop").map((field) =>
      field.value
    );
    if (keys.length === 0) {
      continue;
    }
    const resolvable = getValue(props, keys);
    if (!resolvable) { // TODO(mcandeia) generally this should means a bug but since we are using `onBeforeResolveProps` it could happen, so skipping for now.
      continue;
    }
    const { __resolveType: resolveType, ..._props } = resolvable;
    resolvedKeysPromise.push(
      resolveWithType(
        resolveType,
        _props,
        withResolveChain(ctx, ...hint),
        nullIfDangling,
      )
        .then(
          (resolved) => ({ path: keys, resolved }),
        ),
    );
  }
  const resolvedKeys = await Promise.all(resolvedKeysPromise);
  const resolvedObject = structuredClone(props);
  for (const { path, resolved } of resolvedKeys) {
    withNewValue(resolvedObject, path, resolved);
  }
  return resolvedObject;
};

const invokeResolverWithProps = async <
  T,
  TContext extends BaseContext = BaseContext,
>(
  _props: PropsResolver<T> | T,
  resolver: Resolver,
  __resolveType: string,
  ctx: TContext,
): Promise<T> => {
  let end: (() => void) | undefined = undefined;
  const props = isPropsResolver(_props)
    ? _props
    : (onBeforeResolveProps?: OnBeforeResolveProps) =>
      onBeforeResolveProps ? onBeforeResolveProps(_props) : _props;
  let respOrPromise = resolver(
    await props(resolver?.onBeforeResolveProps),
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
  return isResolvable(respOrPromise)
    ? resolveAny(respOrPromise, ctx)
    : respOrPromise;
};

const resolveWithType = async <
  T,
  TContext extends BaseContext = BaseContext,
>(
  resolveType: string,
  props: PropsResolver<T> | T,
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

  const ctx = withResolveChain(
    context,
    { type: "resolvable", value: resolveType },
  );

  const hints = context.resolveHints[resolveType] ??= traverseAny(
    resolvableObj,
    typeOfFrom(ctx.resolvables, ctx.resolvers),
  );

  return resolveAny(resolvableObj, ctx, nullIfDangling, hints);
};

export type PropsResolver<T> = (
  onBeforeResolveProps?: OnBeforeResolveProps,
) => Promise<T>;

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
  hints?: Hint[],
): Promise<T> => {
  if (!maybeResolvable) {
    return Promise.resolve(maybeResolvable);
  }
  if (isResolved(maybeResolvable)) {
    return Promise.resolve(maybeResolvable.data as T);
  }
  const _props: PropsResolver<T> = (
    onBeforeResolveProps?: OnBeforeResolveProps,
  ) => {
    const { __resolveType: _, ..._props } = maybeResolvable as Resolvable;
    const props = onBeforeResolveProps?.(_props) ?? _props;
    return resolvePropsWithHints(
      props,
      hints ?? traverseAny(
        props,
        typeOfFrom(context.resolvables, context.resolvers),
      ),
      context,
      nullIfDangling,
    );
  };
  if (isResolvable(maybeResolvable)) {
    const { __resolveType } = maybeResolvable;
    return resolveWithType<T, TContext>(
      __resolveType,
      _props,
      context,
      nullIfDangling,
    );
  }
  return _props();
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
