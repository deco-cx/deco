// deno-lint-ignore-file no-explicit-any
import { once, SyncOnce } from "../../utils/sync.ts";
import { Release } from "../releases/provider.ts";
import { ResolveHints } from "./hints.ts";
import {
  BaseContext,
  FieldResolver,
  Monitoring,
  Opts,
  Resolvable,
  ResolvableMap,
  resolve,
  ResolveFunc,
  Resolver,
  ResolverMap,
} from "./resolver.ts";

export interface ResolverOptions<TContext extends BaseContext = BaseContext> {
  release: Release;
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
  release?: Release;
}

export interface ResolveOptions extends Opts {
  overrides?: Record<string, string>;
  monitoring?: Monitoring;
  forceFresh?: boolean;
  propagateOptions?: boolean;
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

const charByType = {
  "resolvable": "@",
  "prop": ".",
};

export const resolverIdFromResolveChain = (chain: FieldResolver[]) => {
  let uniqueId = "";

  // from last to first and stop in the first resolvable
  // the rational behind is: whenever you enter in a resolvable it means that it can be referenced by other resolvables and this value should not change.
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
    this.release = config.release;
    this.resolvers = config.resolvers ?? {};
    this.resolvables = config.resolvables;
    this.danglingRecover = config.danglingRecover;
    this.resolveHints = hints ?? {};
    this.runOncePerRelease = oncePerRelease ?? {};
    this.release.onChange(() => {
      this.runOncePerRelease = {};
      this.resolveHints = {};
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
    const currentOnce = this.runOncePerRelease;
    const resolveChain = options?.resolveChain ?? [];
    const baseCtx: BaseContext = {
      danglingRecover: this.danglingRecover,
      resolve: _resolve as ResolveFunc,
      resolverId: "unknown",
      resolveId: crypto.randomUUID(),
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
        ? { // null if dangling, force fresh and propsAreResolved should not be reused across inner resolvables calls
          overrides: options?.overrides,
          monitoring: options?.monitoring,
          ...(options?.propagateOptions
            ? { nullIfDangling: options?.nullIfDangling, hooks: options?.hooks }
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
      options,
    );
  };
}
