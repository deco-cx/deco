// deno-lint-ignore-file no-explicit-any
import { type AppManifest } from "../mod.ts";
import {
  type Invoke,
  type InvokeAsPayload,
  type InvokeResult,
  type ManifestInvocable,
} from "../utils/invoke.types.ts";
import { type DotNestedKeys } from "../utils/object.ts";
import { Fulfilled, Rejected } from "../utils/promise.ts";
import { type invokeKey } from "./withManifest.ts";

export type InvocationProxyHandler = {
  (props?: any, init?: RequestInit | undefined): Promise<any>;
  [key: string]: InvocationProxyHandler;
};

export type InvocationProxyState = Omit<InvocationProxyHandler, "__parts"> | {
  __parts?: string[] | undefined;
};

export class InvokeAwaiter<
  TManifest extends AppManifest,
  TInvocableKey extends string,
  TFuncSelector extends DotNestedKeys<
    ManifestInvocable<TManifest, TInvocableKey>["return"]
  >,
> implements
  PromiseLike<
    InvokeResult<
      Invoke<TManifest, TInvocableKey, TFuncSelector>,
      TManifest
    >
  >,
  InvokeAsPayload<TManifest, TInvocableKey, TFuncSelector> {
  constructor(
    protected invoker: (
      payload: Invoke<TManifest, TInvocableKey, TFuncSelector>,
      init: RequestInit | undefined,
    ) => Promise<
      InvokeResult<Invoke<TManifest, TInvocableKey, TFuncSelector>, TManifest>
    >,
    public payload: Invoke<TManifest, TInvocableKey, TFuncSelector>,
    protected init?: RequestInit | undefined,
  ) {
  }

  public get() {
    return this.payload;
  }

  then<TResult1, TResult2 = TResult1>(
    onfufilled?: Fulfilled<
      InvokeResult<
        Invoke<TManifest, TInvocableKey, TFuncSelector>,
        TManifest
      >,
      TResult1
    >,
    onrejected?: Rejected<TResult2>,
  ): Promise<TResult1 | TResult2> {
    return this.invoker(this.payload, this.init).then(onfufilled).catch(
      onrejected,
    );
  }
}

export const newHandler = <TManifest extends AppManifest>(
  invoker: typeof invokeKey,
) => {
  const handler = {
    get: function (
      target: InvocationProxyState,
      part: string,
    ): InvocationProxyState {
      if (
        typeof part === "symbol" &&
        (part === Symbol.toStringTag || part === Symbol.toPrimitive)
      ) {
        return (function invokeFunction() {}) as any as InvocationProxyState;
      }
      const currentParts = [...(target.__parts as string[]) ?? [], part];
      const newTarget: InvocationProxyState = function (
        props?: any,
        init?: RequestInit | undefined,
      ): InvokeAwaiter<TManifest, any, any> {
        const ext = part === "x" ? "tsx" : "ts";
        return new InvokeAwaiter<TManifest, any, any>(
          (payload, init) => invoker(payload.key, payload.props, init),
          {
            key: `${currentParts.join("/")}.${ext}`,
            props,
          } as Invoke<TManifest, any, any>,
          init,
        );
      } as InvocationProxyState;
      newTarget.__parts = currentParts;
      return new Proxy(
        newTarget,
        handler,
      );
    },
  };
  return handler;
};
