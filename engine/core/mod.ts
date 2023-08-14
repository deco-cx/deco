// deno-lint-ignore-file no-explicit-any
import { ResolveHints } from "$live/engine/core/hints.ts";
import {
  BaseContext,
  FieldResolver,
  Monitoring,
  Resolvable,
  resolve,
  ResolveFunc,
  Resolver,
  ResolverMap,
} from "$live/engine/core/resolver.ts";
import { Release } from "$live/engine/releases/provider.ts";
import { once, SyncOnce } from "$live/utils/sync.ts";
import { ResolvableMap } from "./resolver.ts";

export interface ResolverOptions<TContext extends BaseContext = BaseContext> {
  resolvers: ResolverMap<TContext>;
  release: Release;
  danglingRecover?: Resolver;
  resolvables?: ResolvableMap;
}

export interface ExtensionOptions<TContext extends BaseContext = BaseContext>
  extends Omit<ResolverOptions<TContext>, "release"> {
  release?: Release;
}

export interface ResolveOptions {
  overrides?: Record<string, string>;
  monitoring?: Monitoring;
  forceFresh?: boolean;
  nullIfDangling?: boolean;
  propagateOptions?: boolean;
  propsIsResolved?: boolean;
  resolveChain?: FieldResolver[];
}

const withOverrides = (
  overrides: Record<string, string> | undefined,
  resolvables: ResolvableMap,
): ResolvableMap => {
  return Object.entries(overrides ?? {}).reduce((nresolvables, [from, to]) => {
    return { ...nresolvables, [from]: nresolvables[to] };
  }, resolvables);
};

export class ReleaseResolver<TContext extends BaseContext = BaseContext> {
  protected release: Release;
  protected resolvers: ResolverMap<TContext>;
  protected resolvables?: ResolvableMap;
  protected danglingRecover?: Resolver;
  protected runOncePerRelease: Record<string, SyncOnce<any>>;
  private resolveHints: ResolveHints;
  constructor(
    config: ResolverOptions<TContext>,
    hints?: ResolveHints,
    oncePerRelease?: Record<string, SyncOnce<any>>,
  ) {
    this.resolvers = config.resolvers;
    this.release = config.release;
    this.resolvables = config.resolvables;
    this.danglingRecover = config.danglingRecover;
    this.resolveHints = hints ?? {};
    this.runOncePerRelease = oncePerRelease ?? {};
    this.release.onChange(() => {
      this.runOncePerRelease = {};
      this.resolveHints = {};
    });
  }

  public clone = () => {
    return new ReleaseResolver<TContext>(
      {
        resolvables: { ...this.resolvables },
        release: this.release,
        resolvers: { ...this.resolvers },
        danglingRecover: this.danglingRecover?.bind(this),
      },
      this.resolveHints,
      this.runOncePerRelease,
    );
  };

  public extend = (
    { resolvers, resolvables }: ExtensionOptions<TContext>,
  ) => {
    this.resolvables = { ...this.resolvables, ...resolvables };
    this.resolvers = { ...this.resolvers, ...resolvers };
  };

  public with = (
    { resolvers, resolvables }: {
      resolvers: ResolverMap<TContext>;
      resolvables?: ResolvableMap;
    },
  ) => {
    return new ReleaseResolver<TContext>({
      resolvables: { ...this.resolvables, ...resolvables },
      release: this.release,
      resolvers: { ...this.resolvers, ...resolvers },
      danglingRecover: this.danglingRecover?.bind(this),
    }, this.resolveHints);
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
    const nresolvables = withOverrides(options?.overrides, {
      ...resolvables,
      ...(this.resolvables ?? {}),
    });
    const resolvers = this.getResolvers();
    const baseCtx: BaseContext<TContext> = {
      danglingRecover: this.danglingRecover,
      resolve: _resolve as ResolveFunc,
      resolveId: crypto.randomUUID(),
      resolveChain: options?.resolveChain ?? [],
      resolveHints: this.resolveHints,
      resolvables: nresolvables,
      resolvers,
      monitoring: options?.monitoring,
      extend: this.extend.bind(this),
      runOnce: (key, f) => {
        return (this.runOncePerRelease[key] ??= once()).do(f);
      },
    };
    const ctx = {
      ...context,
      ...baseCtx,
    };

    const innerResolver = this.resolverFor(
      ctx,
      options
        ? { // null if dangling, force fresh and propsIsResolved should not be reused across inner resolvables calls
          overrides: options?.overrides,
          monitoring: options?.monitoring,
          ...(options?.propagateOptions
            ? { nullIfDangling: options?.nullIfDangling }
            : {}),
        }
        : {},
    );
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
