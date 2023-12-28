import { type InvocationProxyHandler, newHandler } from "../clients/proxy.ts";
import { InvocationFunc } from "../clients/withManifest.ts";
import { ResolveOptions } from "../engine/core/mod.ts";
import type { BaseContext, ResolveFunc } from "../engine/core/resolver.ts";
import type { AppManifest } from "../mod.ts";
import {
  InvocationProxy,
  InvokeFunction,
  payloadForFunc,
} from "../routes/live/invoke/index.ts";

export const buildInvokeFunc = <
  TManifest extends AppManifest = AppManifest,
  TContext extends BaseContext = BaseContext,
>(
  resolver: ResolveFunc,
  options?: Partial<ResolveOptions>,
  partialCtx?: Partial<Omit<TContext, keyof BaseContext>>,
):
  & InvocationProxy<
    TManifest
  >
  & InvocationFunc<TManifest> => {
  const invoker = (
    key: string,
    props: unknown,
  ) =>
    resolver<Awaited<ReturnType<InvocationFunc<TManifest>>>>(
      payloadForFunc({ key, props } as InvokeFunction<TManifest>),
      {
        ...options,
        resolveChain: [...options?.resolveChain ?? [], {
          type: "resolver" as const,
          value: key,
        }],
      },
      partialCtx,
    );

  return new Proxy<InvocationProxyHandler>(
    invoker as InvocationProxyHandler,
    newHandler<TManifest>(invoker),
  ) as unknown as
    & InvocationProxy<
      TManifest
    >
    & InvocationFunc<TManifest>;
};
