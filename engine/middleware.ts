import {
  BaseContext,
  Resolvable,
  Resolver,
} from "$live/engine/core/resolver.ts";

export type ResolverMiddleware<
  T,
  TParent,
  TContext extends BaseContext & { next?(): Promise<T> },
> = Resolver<T, TParent, TContext>;

export const compose = <
  T,
  TParent,
  TContext extends BaseContext & { next?(): Promise<T> },
>(
  last: Resolver<T, TParent, TContext>,
  ...middleware: ResolverMiddleware<T, TParent, TContext>[]
): Resolver<T, TParent, TContext> => {
  return async function (p: TParent, ctx: TContext) {
    // last called middleware #
    let index = -1;
    return await dispatch(0);
    async function dispatch(
      i: number,
      // deno-lint-ignore no-explicit-any
    ): Promise<Resolvable<T, TContext, any>> {
      if (i <= index) {
        return Promise.reject(new Error("next() called multiple times"));
      }
      index = i;
      const resolver = middleware[i];
      if (i === middleware.length) {
        return await last(p, ctx);
      }
      return await resolver(p, {
        ...ctx,
        next: dispatch.bind(null, i + 1),
      });
    }
  };
};
