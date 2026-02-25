// deno-lint-ignore-file no-explicit-any
import { once, type SyncOnce } from "../../utils/sync.ts";
import type { DecofileProvider } from "../decofile/provider.ts";
import type { ResolveHints } from "./hints.ts";
import type {
  BaseContext,
  FieldResolver,
  Monitoring,
  Opts,
  Resolvable,
  ResolvableMap,
  ResolveFunc,
  Resolver,
  ResolverMap,
} from "./resolver.ts";
import { resolve } from "./resolver.ts";

export interface ResolverOptions<TContext extends BaseContext = BaseContext> {
  release: DecofileProvider;
  danglingRecover?: Resolver;
  resolvables?: ResolvableMap;
  resolvers?: ResolverMap<TContext>;
}

export interface ExtensionOptions<TContext extends BaseContext = BaseContext>
  extends
    Omit<
      ResolverOptions<TContext>,
      "release" | "getResolvers" | "loadExtensions"
    > {
  release?: DecofileProvider;
}

export interface ResolveOptions extends Opts {
  overrides?: Record<string, string>;
  monitoring?: Monitoring;
  forceFresh?: boolean;
  propagateOptions?: boolean;
  resolveChain?: FieldResolver[];
  /** @internal Pre-fetched state to avoid redundant async reads on inner resolves */
  _cachedState?: ResolvableMap;
  /** @internal Pre-fetched revision to avoid redundant async reads on inner resolves */
  _cachedRevision?: string;
}

const withOverrides = (
  overrides: Record<string, string> | undefined,
  resolvables: ResolvableMap,
): ResolvableMap => {
  return Object.entries(overrides ?? {}).reduce((nresolvables, [from, to]) => {
    return { ...nresolvables, [from]: nresolvables[to] };
  }, resolvables);
};

const charByType = {
  "resolvable": "@",
  "prop": ".",
};

export const resolverIdFromResolveChain = (chain: FieldResolver[]) => {
  let uniqueId = "";

  // from last to first and stop in the first resolvable
  // the rationale behind is: whenever you enter a resolvable it means that it can be referenced by other resolvables and this value should not change.
  for (let i = chain.length - 1; i >= 0; i--) {
    const { type, value } = chain[i];
    if (type === "prop" || type === "resolvable") {
      const divider = uniqueId.length > 0 ? charByType[type] : "";
      uniqueId = `${value}${divider}${uniqueId}`;
    }
    // stop on first resolvable
    if (type === "resolvable") break;
  }

  return uniqueId;
};

export class ReleaseResolver<TContext extends BaseContext = BaseContext> {
  protected release: DecofileProvider;
  protected resolvers: ResolverMap<TContext>;
  protected resolvables?: ResolvableMap;
  protected danglingRecover?: Resolver;
  protected runOncePerRelease: Record<string, SyncOnce<any>>;
  private resolveHints: ResolveHints;
  private _cachedResolvers: ResolverMap<BaseContext> | null = null;
  private _resolveIdCounter = 0;
  constructor(
    config: ResolverOptions<TContext>,
    hints?: ResolveHints,
    oncePerRelease?: Record<string, SyncOnce<any>>,
  ) {
    this.release = config.release;
    this.resolvers = config.resolvers ?? {};
    this.resolvables = config.resolvables;
    this.danglingRecover = config.danglingRecover;
    this.resolveHints = hints ?? {};
    this.runOncePerRelease = oncePerRelease ?? {};
    this.release.onChange(() => {
      dispatchEvent(new Event("deco:hmr"));
      this.runOncePerRelease = {};
      this.resolveHints = {};
      this._cachedResolvers = null;
    });
  }

  public with = (
    { resolvers, resolvables, release, danglingRecover }: ExtensionOptions<
      TContext
    >,
  ): ReleaseResolver<TContext> =>
    new ReleaseResolver<TContext>(
      {
        release: release ?? this.release,
        danglingRecover: danglingRecover ?? this.danglingRecover,
        resolvables: { ...this.resolvables, ...resolvables },
        resolvers: { ...this.resolvers, ...resolvers },
      },
      { ...this.resolveHints },
      {
        ...this.runOncePerRelease,
      },
    );

  public getResolvers(): ResolverMap<BaseContext> {
    return this._cachedResolvers ??= {
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
    const hasCached = options?._cachedState !== undefined &&
      options?._cachedRevision !== undefined;

    let resolvables: ResolvableMap;
    let revision: string;

    if (hasCached && !options?.forceFresh) {
      resolvables = options!._cachedState!;
      revision = options!._cachedRevision!;
    } else {
      [resolvables, revision] = await Promise.all([
        this.release.state({ forceFresh: options?.forceFresh }),
        this.release.revision(),
      ]);
    }

    const mergedResolvables = this.resolvables
      ? { ...resolvables, ...this.resolvables }
      : resolvables;
    const nresolvables = options?.overrides
      ? withOverrides(options.overrides, mergedResolvables)
      : mergedResolvables;
    const resolvers = this.getResolvers();
    const currentOnce = this.runOncePerRelease;
    const resolveChain = options?.resolveChain ?? [];
    const baseCtx: BaseContext = {
      revision,
      danglingRecover: this.danglingRecover,
      resolve: _resolve as ResolveFunc,
      resolverId: "unknown",
      resolveId: `r${++this._resolveIdCounter}`,
      resolveChain,
      resolveHints: this.resolveHints,
      resolvables: nresolvables,
      resolvers,
      monitoring: options?.monitoring,
      memo: {},
      runOnce: (key, f) => {
        return (currentOnce[key] ??= once()).do(f);
      },
    };
    const ctx = { ...context, ...baseCtx };

    const innerResolver = this.resolverFor(
      ctx,
      options
        ? {
          overrides: options?.overrides,
          monitoring: options?.monitoring,
          _cachedState: resolvables,
          _cachedRevision: revision,
          ...(options?.propagateOptions
            ? { nullIfDangling: options?.nullIfDangling, hooks: options?.hooks }
            : {}),
        }
        : { _cachedState: resolvables, _cachedRevision: revision },
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
      options,
    );
  };
}
