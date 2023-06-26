// deno-lint-ignore-file no-explicit-any
import { ResolveHints } from "$live/engine/core/hints.ts";
import {
  BaseContext,
  Monitoring,
  Resolvable,
  resolve,
  ResolveFunc,
  Resolver,
  ResolverMap,
} from "$live/engine/core/resolver.ts";
import { Release } from "$live/engine/releases/provider.ts";

export interface ResolverOptions<TContext extends BaseContext = BaseContext> {
  resolvers: ResolverMap<TContext>;
  release: Release;
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
  protected release: Release;
  protected resolvers: ResolverMap<TContext>;
  protected danglingRecover?: Resolver;
  private resolveHints: ResolveHints;
  constructor(config: ResolverOptions<TContext>) {
    this.resolvers = config.resolvers;
    this.release = config.release;
    this.danglingRecover = config.danglingRecover;
    this.resolveHints = {};
    this.release.onChange(() => {
      console.debug("release has been changed");
      this.resolveHints = {};
    });
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
    const resolvables = await this.release.state({
      forceFresh: options?.forceFresh,
    });
    const nresolvables = withOverrides(options?.overrides, resolvables);
    const resolvers = this.getResolvers();
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

    return resolve<T, TContext>(
      typeOrResolvable,
      ctx as TContext,
      options?.nullIfDangling,
      options?.propsIsResolved,
    );
  };
}
