// deno-lint-ignore-file no-explicit-any
import type {
  BaseContext,
  Resolvable,
  Resolver,
} from "../engine/core/resolver.ts";

export interface ResolverMiddlewareContext<T = any> extends BaseContext {
  next?(): Promise<T>;
}
export type ResolverMiddleware<
  T = any,
  TParent = any,
  TContext extends ResolverMiddlewareContext<T> = ResolverMiddlewareContext<T>,
> = Resolver<T, TParent, TContext>;

export const compose = <
  T,
  TParent,
  TContext extends ResolverMiddlewareContext<T>,
>(
  ...middlewares: ResolverMiddleware<T, TParent, TContext>[]
): Resolver<T, TParent, TContext> => {
  const last = middlewares[middlewares.length - 1];
  return async function composedResolver(p: TParent, ctx: TContext) {
    const dispatch = async (
      i: number,
    ): Promise<Resolvable<T, TContext, any>> => {
      const resolver = middlewares[i];
      if (!resolver) {
        return last(p, ctx);
      }
      const next = () => dispatch(i + 1);
      return resolver(p, { ...ctx, next });
    };

    return dispatch(0);
  };
};
