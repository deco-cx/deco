// deno-lint-ignore-file no-explicit-any
import {
  isAwaitable,
  mapObjKeys,
  PromiseOrValue,
  Promisified,
  UnPromisify,
  waitKeys,
} from "$live/engine/core/utils.ts";
import { createServerTimings } from "$live/utils/timings.ts";

export class DanglingReference extends Error {
  public resolverType: string;
  constructor(resolverType: string) {
    super(`Dangling reference of: ${resolverType}`);
    this.resolverType = resolverType;
  }
}
export type ResolveFunc<T = any, TContext extends BaseContext = BaseContext> = (
  data: Resolvable<T>,
  forceFresh?: boolean,
  partialCtx?: Partial<Omit<TContext, keyof BaseContext>>,
) => Promise<T>;

export interface Monitoring {
  t: Omit<ReturnType<typeof createServerTimings>, "printTimings">;
}

export interface BaseContext {
  resolveChain: string[];
  resolveId: string;
  resolve: ResolveFunc;
  monitoring?: Monitoring;
  resolvables: Record<string, Resolvable<any>>;
  resolvers: Record<string, Resolver>;
  danglingRecover?: Resolver;
}

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

const isResolvable = <
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

const isResolvableObj = <
  T = any,
  TContext extends BaseContext = BaseContext,
  TResolverMap extends ResolverMap<TContext> = ResolverMap<TContext>,
  TResolvableMap extends Record<
    string,
    Resolvable<any, TContext, TResolverMap>
  > = Record<string, Resolvable<any, TContext, TResolverMap>>,
>(
  v:
    | T
    | Resolvable<T, TContext, TResolverMap, TResolvableMap>
    | ResolvableObj<T, TContext, TResolverMap>,
): v is ResolvableObj<T, TContext, TResolverMap> => {
  return !isResolvable(v as { __resolveType: string }) && typeof v === "object";
};

export type AsyncResolver<
  T = any,
  TParent = any,
  TContext extends BaseContext = BaseContext,
> = (
  parent: TParent,
  context: TContext,
) => Promise<Resolvable<T, TContext, any>>;

export type SyncResolver<
  T = any,
  TParent = any,
  TContext extends BaseContext = BaseContext,
> = (parent: TParent, context: TContext) => Resolvable<T, TContext, any>;

export type Resolver<
  T = any,
  TParent = any,
  TContext extends BaseContext = BaseContext,
> = AsyncResolver<T, TParent, TContext> | SyncResolver<T, TParent, TContext>;

export type ResolverMap<TContext extends BaseContext = BaseContext> = Record<
  string,
  Resolver<any, any, TContext>
>;

async function object<
  T,
  TContext extends BaseContext = BaseContext,
  TResolverMap extends ResolverMap<TContext> = ResolverMap<TContext>,
  TResolvableMap extends Record<
    string,
    Resolvable<any, TContext, TResolverMap, TResolvableMap> | undefined
  > = Record<string, Resolvable<any, TContext, TResolverMap> | undefined>,
>(
  obj: Omit<
    Resolvable<T, TContext, TResolverMap, TResolvableMap>,
    "__resolveType"
  >,
  resolve: <K extends keyof T>(
    resolvable: Resolvable<T[K], TContext, TResolverMap, TResolvableMap>,
  ) => PromiseOrValue<T[K]>,
): Promise<T> {
  if (obj instanceof Date) {
    return obj as T;
  }
  if (!isResolvableObj(obj)) {
    return obj as T;
  }
  // @ts-ignore: "typescript can't analyze this type"
  if (Array.isArray(obj)) {
    return (await Promise.all(obj.map(resolve))) as T;
  }
  const promisifedKeys = mapObjKeys<
    ResolvableObj<T>,
    Promisified<ResolvableObj<T>>
  >(obj, resolve);

  return (await waitKeys(promisifedKeys)) as T;
}

const identity = <V>(k: Omit<Resolvable<V, any, any, any>, "__resolveType">) =>
  k as V;
const nativeResolverByType: Record<
  string,
  <
    T,
    TContext extends BaseContext = BaseContext,
    TResolverMap extends ResolverMap<TContext> = ResolverMap<TContext>,
    TResolvableMap extends Record<
      string,
      Resolvable<any, TContext, TResolverMap, TResolvableMap> | undefined
    > = Record<string, Resolvable<any, TContext, TResolverMap> | undefined>,
  >(
    obj: Omit<
      Resolvable<T, TContext, TResolverMap, TResolvableMap>,
      "__resolveType"
    >,
    resolve: <K>(
      resolvable: Resolvable<K, TContext, TResolverMap, TResolvableMap>,
    ) => PromiseOrValue<K>,
  ) => PromiseOrValue<T>
> = {
  object,
  number: identity,
  string: identity,
  function: identity,
  boolean: identity,
  undefined: identity,
};

export const withResolveChain = <T extends BaseContext = BaseContext>(
  ctx: T,
  ...resolverType: string[]
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
      return resolve<T, T>(
        data,
        newCtx as T,
      );
    },
  };
};

export const ALREADY_RESOLVED = "resolved";

export interface Resolved<T> {
  data: T;
  __resolveType: "resolved";
}

const isResolved = <T>(
  resolvable: Resolvable<T> | Resolved<T>,
): resolvable is Resolved<T> => {
  return (isResolvable(resolvable)) &&
    resolvable.__resolveType === ALREADY_RESOLVED;
};

export const resolve = async <
  T,
  TContext extends BaseContext = BaseContext,
>(
  resolvable: Resolvable<T, TContext>,
  context: TContext,
): Promise<T> => {
  if (isResolved(resolvable)) {
    return resolvable.data;
  }
  const { resolvers: resolverMap, resolvables } = context;

  // get the __resolveType from the resolvable
  const [resolvableObj, resolveType] = resolveTypeOf(resolvable);

  // define the type resolver based on the object type
  const typeResolver = nativeResolverByType[typeof resolvableObj];

  // if the resolveType is not defined we should use the typeresolver
  if (resolveType === undefined) {
    // since array is also an object so we should check it strictly instead
    if (Array.isArray(resolvableObj)) {
      return await typeResolver<T, TContext>(
        resolvableObj,
        (data) => resolve(data, context),
      );
    }
    return resolvableObj as T;
  }

  const ctx = withResolveChain(context, resolveType);
  const resolved = await typeResolver<T, TContext>(
    resolvableObj,
    (data) =>
      resolve(
        data,
        ctx,
      ),
  );
  const resolver = resolverMap[resolveType];
  if (resolver !== undefined) {
    let end: (() => void) | undefined = undefined;
    let respOrPromise = resolver(resolved, ctx);
    if (isAwaitable(respOrPromise)) {
      const timingName = resolveType.replaceAll("/", ".");
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
    return resolve(respOrPromise, ctx);
  }
  const resolvableRef = resolvables[resolveType] as Resolvable<T>;
  if (resolvableRef === undefined) {
    if (!ctx.danglingRecover) {
      throw new DanglingReference(resolveType);
    }
    return ctx.danglingRecover(resolved, ctx);
  }
  return resolve<T, TContext>(
    resolvableRef,
    ctx,
  );
};
