// deno-lint-ignore-file no-explicit-any
import { AppManifest } from "../mod.ts";
import { Invoke, InvokeAwaiter } from "../routes/live/invoke/index.ts";
import { invokeKey } from "./withManifest.ts";

export type InvocationProxyHandler = {
  (props?: any, init?: RequestInit | undefined): Promise<any>;
  [key: string]: InvocationProxyHandler;
};

export type InvocationProxyState = Omit<InvocationProxyHandler, "__parts"> | {
  __parts?: string[] | undefined;
};

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
