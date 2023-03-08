// deno-lint-ignore-file no-explicit-any
import {
  BaseContext,
  Resolvable,
  resolve,
  ResolverMap,
} from "$live/engine/core/resolver.ts";
import { PromiseOrValue } from "$live/engine/core/utils.ts";
export interface RezolverConfig<TContext extends BaseContext = BaseContext> {
  resolvers: ResolverMap<TContext>;
  getResolvable: <V>(t: string) => Resolvable<V>;
}

export class Rezolver<TContext extends BaseContext = BaseContext> {
  protected getResolvable: <T>(type: string) => Resolvable<T>;
  protected resolvers: ResolverMap<TContext>;
  constructor(protected config: RezolverConfig<TContext>) {
    this.resolvers = {};
    this.getResolvable = this.config.getResolvable.bind(this.config);
  }

  public addResolvers = (resolvers: ResolverMap<TContext>) => {
    this.resolvers = {
      ...this.resolvers,
      ...resolvers,
    };
  };

  public resolve = <T = any>(
    typeOrResolvable: string | Resolvable<T>,
    context: Omit<TContext, keyof BaseContext>,
    overrides?: Record<string, string>
  ): PromiseOrValue<T> => {
    const { resolvers: res, getResolvable: useConfigs } = this.config;
    const getResolvable = overrides
      ? <V>(key: string): Resolvable<V> => {
          const rerouted = overrides[key] ?? key;
          return useConfigs(rerouted);
        }
      : useConfigs;
    const resolvers = {
      ...res,
      ...this.resolvers,
      resolve: function _resolve(obj: any, { resolve }: BaseContext) {
        return resolve(obj);
      },
    };
    const baseCtx: BaseContext = {
      resolve: _resolve,
      resolveId: crypto.randomUUID(),
    };
    const ctx = {
      ...context,
      ...baseCtx,
    };
    function _resolve<T>(data: Resolvable<T>): Promise<T> {
      return resolve(resolvers, data, getResolvable, ctx);
    }
    const resolvable =
      typeof typeOrResolvable === "string"
        ? getResolvable<T>(typeOrResolvable)
        : typeOrResolvable;
    if (resolvable === undefined) {
      return undefined as T;
    }
    return resolve<T, TContext>(
      resolvers,
      resolvable,
      getResolvable,
      ctx as TContext
    );
  };
}
