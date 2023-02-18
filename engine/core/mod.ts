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
  constructor(protected config: RezolverConfig<TContext>) {
    this.getResolvable = this.config.getResolvable.bind(this.config);
  }

  public resolve = <T = any>(
    type: string,
    context: Omit<TContext, keyof BaseContext>
  ): PromiseOrValue<T> => {
    const { resolvers: res, getResolvable } = this.config;
    const resolvers = {
      ...res,
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
    const resolvable = this.getResolvable(type);
    if (resolvable === undefined) {
      return undefined as T;
    }
    return resolve<T, TContext>(
      resolvers,
      this.getResolvable(type),
      this.getResolvable,
      ctx as TContext
    );
  };
}
