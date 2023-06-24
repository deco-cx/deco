// deno-lint-ignore-file no-explicit-any
import { ResolveHints } from "$live/engine/core/hints.ts";
import {
  BaseContext,
  isResolvable,
  Monitoring,
  Resolvable,
  resolve,
  ResolveFunc,
  Resolver,
  ResolverMap,
  resolveWithType,
} from "$live/engine/core/resolver.ts";
import { PromiseOrValue } from "$live/engine/core/utils.ts";

export interface ResolverOptions<TContext extends BaseContext = BaseContext> {
  resolvers: ResolverMap<TContext>;
  getResolvables: (
    fresh?: boolean,
  ) => PromiseOrValue<Record<string, Resolvable<any>>>;
  revision: () => PromiseOrValue<string>;
  danglingRecover?: Resolver;
}

export interface ResolveOptions {
  overrides?: Record<string, string>;
  monitoring?: Monitoring;
  forceFresh?: boolean;
  nullIfDangling?: boolean;
  propsIsResolved?: boolean;
}

const withOverrides = (
  overrides: Record<string, string> | undefined,
  resolvables: Record<string, Resolvable<any>>,
): Record<string, Resolvable<any>> => {
  return Object.entries(overrides ?? {}).reduce((nresolvables, [from, to]) => {
    return { ...nresolvables, [from]: nresolvables[to] };
  }, resolvables);
};

export class ReleaseResolver<TContext extends BaseContext = BaseContext> {
  public getResolvables: (forceFresh?: boolean) => PromiseOrValue<
    Record<string, Resolvable<any>>
  >;
  protected resolvers: ResolverMap<TContext>;
  protected danglingRecover?: Resolver;
  private resolveHints: ResolveHints;
  private currentRevision: string | null;
  private getRevision: () => PromiseOrValue<string>;
  constructor(config: ResolverOptions<TContext>) {
    this.resolvers = config.resolvers;
    this.getResolvables = config.getResolvables;
    this.danglingRecover = config.danglingRecover;
    this.getRevision = config.revision;
    this.resolveHints = {};
    this.currentRevision = null;
  }

  public addResolvers = (resolvers: ResolverMap<TContext>) => {
    this.resolvers = {
      ...this.resolvers,
      ...resolvers,
    };
  };

  public getResolvers(): ResolverMap<BaseContext> {
    return {
      ...this.resolvers,
      resolve: function _resolve(obj: any, { resolve }: BaseContext) {
        return resolve(obj);
      },
    };
  }

  public resolverFor = (
    context: Omit<TContext, keyof BaseContext>,
    options?: ResolveOptions,
  ) =>
  <T = any>(
    typeOrResolvable: string | Resolvable<T>,
    overrideOptions?: Partial<ResolveOptions>,
    partialCtx: Partial<Omit<TContext, keyof BaseContext>> = {},
  ): Promise<T> => {
    return this.resolve(typeOrResolvable, { ...context, ...partialCtx }, {
      ...(options ?? {}),
      ...(overrideOptions ?? {}),
    });
  };

  public resolve = async <T = any>(
    typeOrResolvable: string | Resolvable<T>,
    context: Omit<TContext, keyof BaseContext>,
    options?: ResolveOptions,
  ): Promise<T> => {
    const revision = await this.getRevision(); // should not be done in parallel since there's a racing condition that could return a new revision with old data.
    const resolvables = await this.getResolvables(options?.forceFresh);
    const nresolvables = withOverrides(options?.overrides, resolvables);
    const resolvers = this.getResolvers();
    if (this.currentRevision !== revision) {
      this.resolveHints = {};
      this.currentRevision = revision;
    }
    const baseCtx: BaseContext = {
      danglingRecover: this.danglingRecover,
      resolve: _resolve as ResolveFunc,
      resolveId: crypto.randomUUID(),
      resolveChain: [],
      resolveHints: this.resolveHints,
      resolvables: nresolvables,
      resolvers,
      monitoring: options?.monitoring,
    };
    const ctx = {
      ...context,
      ...baseCtx,
    };

    const innerResolver = this.resolverFor(ctx, options);
    function _resolve<T>(
      typeOrResolvable: string | Resolvable<T>,
      overrideOptions?: Partial<ResolveOptions>,
      partialCtx: Partial<Omit<TContext, keyof BaseContext>> = {},
    ): Promise<T> {
      return innerResolver(typeOrResolvable, overrideOptions, partialCtx);
    }
    if (typeOrResolvable === undefined) {
      return undefined as T;
    }
    if (options?.propsIsResolved && isResolvable(typeOrResolvable)) {
      const { __resolveType, ...props } = typeOrResolvable as Resolvable;
      return resolveWithType(
        __resolveType,
        props,
        ctx,
        options?.nullIfDangling,
      );
    }

    return resolve<T, TContext>(
      typeOrResolvable,
      ctx as TContext,
      options?.nullIfDangling,
    );
  };
}
