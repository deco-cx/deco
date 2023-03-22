// deno-lint-ignore-file no-explicit-any
import {
  BaseContext,
  Monitoring,
  Resolvable,
  resolve,
  Resolver,
  ResolverMap,
} from "$live/engine/core/resolver.ts";
import { PromiseOrValue } from "$live/engine/core/utils.ts";

export interface ResolverOptions<TContext extends BaseContext = BaseContext> {
  resolvers: ResolverMap<TContext>;
  resolvables: PromiseOrValue<Record<string, Resolvable<any>>>;
  danglingRecover?: Resolver;
}

export interface ResolveOptions {
  overrides?: Record<string, string>;
  monitoring?: Monitoring;
}

const withOverrides = (
  overrides: Record<string, string> | undefined,
  resolvables: Record<string, Resolvable<any>>,
): Record<string, Resolvable<any>> => {
  return Object.entries(overrides ?? {}).reduce((nresolvables, [from, to]) => {
    return { ...nresolvables, [from]: nresolvables[to] };
  }, resolvables);
};

export class ConfigResolver<TContext extends BaseContext = BaseContext> {
  protected resolvables: PromiseOrValue<Record<string, Resolvable<any>>>;
  protected resolvers: ResolverMap<TContext>;
  protected danglingRecover?: Resolver;
  constructor(protected config: ResolverOptions<TContext>) {
    this.resolvers = {};
    this.resolvables = this.config.resolvables;
    this.danglingRecover = this.config.danglingRecover;
  }

  public addResolvers = (resolvers: ResolverMap<TContext>) => {
    this.resolvers = {
      ...this.resolvers,
      ...resolvers,
    };
  };

  public setResolvables = (
    resolvables: PromiseOrValue<Record<string, Resolvable<any>>>,
  ) => {
    this.resolvables = resolvables;
  };

  public resolverFor = (
    context: Omit<TContext, keyof BaseContext>,
    options?: ResolveOptions,
  ) =>
  <T = any>(typeOrResolvable: string | Resolvable<T>): Promise<T> => {
    return this.resolve(typeOrResolvable, context, options);
  };

  public resolve = async <T = any>(
    typeOrResolvable: string | Resolvable<T>,
    context: Omit<TContext, keyof BaseContext>,
    options?: ResolveOptions,
  ): Promise<T> => {
    const { resolvers: res, resolvables: rPromise } = this.config;
    const resolvables = await rPromise;
    const nresolvables = withOverrides(options?.overrides, resolvables);
    const resolvers = {
      ...res,
      ...this.resolvers,
      resolve: function _resolve(obj: any, { resolve }: BaseContext) {
        return resolve(obj);
      },
    };
    const baseCtx: BaseContext = {
      danglingRecover: this.danglingRecover,
      resolve: _resolve,
      resolveId: crypto.randomUUID(),
      resolveChain: [],
      resolvables: nresolvables,
      resolvers,
      monitoring: options?.monitoring,
    };
    const ctx = {
      ...context,
      ...baseCtx,
    };
    function _resolve<T>(data: Resolvable<T, TContext>): Promise<T> {
      return resolve<T, TContext>(
        resolvers,
        data,
        nresolvables,
        ctx as TContext,
      );
    }
    const resolvable = typeof typeOrResolvable === "string"
      ? nresolvables[typeOrResolvable]
      : typeOrResolvable;
    if (resolvable === undefined) {
      return undefined as T;
    }
    return resolve<T, TContext>(
      resolvers,
      resolvable,
      nresolvables,
      ctx as TContext,
    );
  };
}
