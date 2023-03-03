// deno-lint-ignore-file no-explicit-any
import {
  mapObjKeys,
  PromiseOrValue,
  Promisified,
  waitKeys,
} from "$live/engine/core/utils.ts";

export type ResolveFunc<T = any> = (data: Resolvable<T>) => Promise<T>;
export interface BaseContext {
  resolveId: string;
  resolve: ResolveFunc;
}

export type ResolvableObj<T> = {
  [key in keyof T]: Resolvable<T[key]>;
};
export type Resolvable<T = any> = T & { __resolveType: string };

const resolveTypeOf = <T>(
  resolvable: T | Resolvable<T>,
): [Omit<T, "__resolveType">, ((p: unknown) => string) | undefined] => {
  if (isResolvable(resolvable)) {
    const { __resolveType, ...rest } = resolvable;
    if (typeof __resolveType === "function") {
      return [rest as Omit<T, "__resolveType">, __resolveType];
    }
    return [rest as Omit<T, "__resolveType">, () => __resolveType];
  }
  return [resolvable, undefined];
};

const isResolvable = <T>(v: T | Resolvable<T>): v is Resolvable<T> => {
  return (v as { __resolveType: string })?.__resolveType !== undefined;
};

const isResolvableObj = <T>(
  v: T | Resolvable<T> | ResolvableObj<T>,
): v is ResolvableObj<T> => {
  return !isResolvable(v) && typeof v === "object";
};

export type AsyncResolver<
  T = any,
  TParent = any,
  TContext extends BaseContext = BaseContext,
> = (parent: TParent, context: TContext) => Promise<Resolvable<T> | T>;

export type SyncResolver<
  T = any,
  TParent = any,
  TContext extends BaseContext = BaseContext,
> = (parent: TParent, context: TContext) => Resolvable<T> | T;

export type Resolver<
  T = any,
  TParent = any,
  TContext extends BaseContext = BaseContext,
> = AsyncResolver<T, TParent, TContext> | SyncResolver<T, TParent, TContext>;

export type ResolverMap<TContext extends BaseContext = BaseContext> = Record<
  string,
  Resolver<any, any, TContext>
>;

async function object<T>(
  obj: ResolvableObj<T> | T,
  resolve: <K extends keyof T>(
    resolvable: Resolvable<T[K]>,
  ) => PromiseOrValue<T[K]>,
): Promise<T> {
  if (obj instanceof Date) {
    return obj;
  }
  if (!isResolvableObj(obj)) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return (await Promise.all(obj.map(resolve))) as T;
  }
  const promisifedKeys = mapObjKeys<
    ResolvableObj<T>,
    Promisified<ResolvableObj<T>>
  >(obj, resolve);

  return await waitKeys(promisifedKeys);
}

const identity = <V>(k: V) => k;
const nativeResolverByType: Record<
  string,
  <T>(
    obj: T | ResolvableObj<T>,
    resolve: <K>(resolvable: Resolvable<K>) => PromiseOrValue<K>,
  ) => PromiseOrValue<T>
> = {
  object,
  number: identity,
  string: identity,
  function: identity,
  boolean: identity,
  undefined: identity,
};

export const resolve = async <T, TContext extends BaseContext = BaseContext>(
  resolverMap: ResolverMap<TContext>,
  resolvable: Resolvable<T>,
  getResolvable: <T>(type: string) => Resolvable<T> | undefined,
  context: TContext,
): Promise<T> => {
  const resolverFunc = <K>(data: Resolvable<K>) =>
    resolve(resolverMap, data, getResolvable, context);

  const [resolvableObj, type] = resolveTypeOf(resolvable);
  const tpResolver = nativeResolverByType[typeof resolvableObj];
  if (type === undefined) {
    if (Array.isArray(resolvableObj)) {
      return await tpResolver(resolvableObj as T, resolverFunc);
    }
    return resolvableObj as T;
  }
  const resolved = await tpResolver(resolvableObj as T, resolverFunc);
  const resolverType = type(resolved);
  const resolver = resolverMap[resolverType];
  if (resolver !== undefined) {
    return resolve(
      resolverMap,
      await resolver(resolved, context),
      getResolvable,
      context,
    ) as T;
  }
  const resolvableRef = getResolvable(resolverType);
  if (resolvableRef === undefined) {
    throw new Error("Dangling reference of: " + resolverType);
  }
  return resolve(
    resolverMap,
    resolvableRef as Resolvable<T>,
    getResolvable,
    context,
  );
};
