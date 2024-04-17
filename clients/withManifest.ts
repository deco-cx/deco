// deno-lint-ignore-file no-explicit-any
import { IS_BROWSER } from "$fresh/runtime.ts";
import type { App, AppManifest, ManifestOf } from "../blocks/app.ts";
import type { StreamProps } from "../mod.ts";
import type {
  AvailableActions,
  AvailableFunctions,
  AvailableLoaders,
  InvocationProxy,
  Invoke,
  InvokeAsPayload,
  InvokeResult,
  ManifestAction,
  ManifestFunction,
  ManifestInvocable,
  ManifestLoader,
} from "../utils/invoke.types.ts";
import type { DotNestedKeys } from "../utils/object.ts";
import { InvocationProxyHandler, InvokeAwaiter, newHandler } from "./proxy.ts";

export interface InvokerRequestInit extends RequestInit {
  fetcher?: typeof fetch;
}

export type GenericFunction = (...args: any[]) => Promise<any>;

export const isStreamProps = <TProps>(
  props: TProps | TProps & StreamProps,
): props is TProps & StreamProps => {
  return Boolean((props as StreamProps)?.stream) === true;
};

export async function* readFromStream<T>(
  response: Response,
): AsyncIterableIterator<T> {
  if (!response.body) {
    return;
  }
  const reader = response.body
    .pipeThrough(new TextDecoderStream())
    .getReader();

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    for (const data of value.split("\n")) {
      if (!data.startsWith("data:")) {
        continue;
      }

      try {
        yield JSON.parse(decodeURIComponent(data.replace("data:", "")));
      } catch (_err) {
        console.log("error parsing data", _err, data);
        continue;
      }
    }
  }
}

const fetchWithProps = async (
  url: string,
  props: unknown,
  init?: InvokerRequestInit | undefined,
) => {
  if (!IS_BROWSER) {
    console.warn(
      "👋 Oops! Runtime.invoke should be called only on the client-side, but it seems to be called on the server-side instead. No worries, mistakes happen! 😉",
    );
  }
  const headers = new Headers(init?.headers);

  headers.set("accept", `application/json, text/event-stream`);
  headers.set("content-type", "application/json");

  const response = await (init?.fetcher ?? fetch)(url, {
    method: "POST",
    body: JSON.stringify(props),
    ...init,
    headers,
  });

  if (response.status === 204) {
    return;
  }

  if (response.ok) {
    if (response.headers.get("content-type") === "text/event-stream") {
      return readFromStream(response);
    }
    return response.json();
  }

  console.error(init?.body, response);
  const error = await response.text();
  if (response.headers.get("content-type") === "application/json") {
    const errorObj = JSON.parse(error);
    throw new Error(`${response.status}: ${response.statusText}`, {
      cause: errorObj,
    });
  }
  throw new Error(`${response.status}: ${response.statusText}`, {
    cause: error,
  });
};

export const invokeKey = (
  key: string,
  props?: unknown,
  init?: InvokerRequestInit | undefined,
) => fetchWithProps(`/live/invoke/${key}`, props, init);

const batchInvoke = (payload: unknown, init?: InvokerRequestInit | undefined) =>
  fetchWithProps(`/live/invoke`, payload, init);

export type InvocationFunc<TManifest extends AppManifest> = <
  TInvocableKey extends
    | AvailableFunctions<TManifest>
    | AvailableLoaders<TManifest>
    | AvailableActions<TManifest>,
  TFuncSelector extends TInvocableKey extends AvailableFunctions<TManifest>
    ? DotNestedKeys<ManifestFunction<TManifest, TInvocableKey>["return"]>
    : TInvocableKey extends AvailableActions<TManifest>
      ? DotNestedKeys<ManifestAction<TManifest, TInvocableKey>["return"]>
    : TInvocableKey extends AvailableLoaders<TManifest>
      ? DotNestedKeys<ManifestLoader<TManifest, TInvocableKey>["return"]>
    : never,
  TPayload extends Invoke<TManifest, TInvocableKey, TFuncSelector>,
>(
  key: TInvocableKey,
  props?: Invoke<TManifest, TInvocableKey, TFuncSelector>["props"],
) => Promise<
  InvokeResult<
    TPayload,
    TManifest
  >
>;

export type AvailableInvocations<TManifest extends AppManifest> =
  | AvailableFunctions<TManifest>
  | AvailableActions<TManifest>
  | AvailableLoaders<TManifest>;

export type InvocationFuncFor<
  TManifest extends AppManifest,
  TInvocableKey extends string,
  TFuncSelector extends TInvocableKey extends AvailableFunctions<TManifest>
    ? DotNestedKeys<ManifestFunction<TManifest, TInvocableKey>["return"]>
    : TInvocableKey extends AvailableActions<TManifest>
      ? DotNestedKeys<ManifestAction<TManifest, TInvocableKey>["return"]>
    : TInvocableKey extends AvailableLoaders<TManifest>
      ? DotNestedKeys<ManifestLoader<TManifest, TInvocableKey>["return"]>
    : never = TInvocableKey extends AvailableFunctions<TManifest>
      ? DotNestedKeys<ManifestFunction<TManifest, TInvocableKey>["return"]>
      : TInvocableKey extends AvailableActions<TManifest>
        ? DotNestedKeys<ManifestAction<TManifest, TInvocableKey>["return"]>
      : TInvocableKey extends AvailableLoaders<TManifest>
        ? DotNestedKeys<ManifestLoader<TManifest, TInvocableKey>["return"]>
      : never,
> = (
  props?: Invoke<TManifest, TInvocableKey, TFuncSelector>["props"],
  /**
   * Used client-side only
   */
  init?: RequestInit | undefined,
) => InvokeAwaiter<TManifest, TInvocableKey, TFuncSelector>;

const isInvokeAwaiter = <
  TManifest extends AppManifest,
  TInvocableKey extends string,
  TFuncSelector extends DotNestedKeys<
    ManifestInvocable<TManifest, TInvocableKey>["return"]
  >,
>(
  invoke: unknown | InvokeAwaiter<TManifest, TInvocableKey, TFuncSelector>,
): invoke is InvokeAwaiter<TManifest, TInvocableKey, TFuncSelector> => {
  return (invoke as InvokeAwaiter<TManifest, TInvocableKey, TFuncSelector>)
        ?.then !== undefined &&
    (invoke as InvokeAwaiter<TManifest, TInvocableKey, TFuncSelector>)
        ?.payload !== undefined;
};

/**
 * Receives the function id as a parameter (e.g `#FUNC_ID`, the `#` will be ignored)
 * or the function name as a parameter (e.g `deco-sites/std/functions/vtexProductList.ts`) and invoke the target function passing the provided `props` as the partial input for the function.
 * @returns the function return.
 */
export const invoke = <
  TManifest extends AppManifest,
>(fetcher?: typeof fetch) =>
<
  TInvocableKey extends
    | AvailableFunctions<TManifest>
    | AvailableLoaders<TManifest>
    | AvailableActions<TManifest>,
  TFuncSelector extends TInvocableKey extends AvailableFunctions<TManifest>
    ? DotNestedKeys<ManifestFunction<TManifest, TInvocableKey>["return"]>
    : TInvocableKey extends AvailableActions<TManifest>
      ? DotNestedKeys<ManifestAction<TManifest, TInvocableKey>["return"]>
    : TInvocableKey extends AvailableLoaders<TManifest>
      ? DotNestedKeys<ManifestLoader<TManifest, TInvocableKey>["return"]>
    : never,
  TPayload extends
    | Invoke<TManifest, TInvocableKey, TFuncSelector>
    | InvokeAsPayload<TManifest, TInvocableKey, TFuncSelector>
    | Record<
      string,
      | Invoke<TManifest, TInvocableKey, TFuncSelector>
      | InvokeAsPayload<TManifest, TInvocableKey, TFuncSelector>
    >,
>(
  payload: TPayload,
  init?: InvokerRequestInit | undefined,
): Promise<
  InvokeResult<
    TPayload,
    TManifest
  >
> => {
  if (typeof payload === "object") {
    const reqs: Record<
      string,
      Invoke<TManifest, TInvocableKey, TFuncSelector>
    > = {};
    for (const [key, val] of Object.entries(payload)) {
      if (isInvokeAwaiter(val)) {
        reqs[key] = val.payload;
      } else {
        reqs[key] = val;
      }
    }
    return batchInvoke(reqs, { ...init ?? {}, fetcher });
  }
  return batchInvoke(payload, { ...init ?? {}, fetcher });
};

export const create = <
  TManifest extends AppManifest,
>() =>
<
  TInvocableKey extends
    | AvailableFunctions<TManifest>
    | AvailableLoaders<TManifest>
    | AvailableActions<TManifest>,
  TFuncSelector extends TInvocableKey extends AvailableFunctions<TManifest>
    ? DotNestedKeys<ManifestFunction<TManifest, TInvocableKey>["return"]>
    : TInvocableKey extends AvailableActions<TManifest>
      ? DotNestedKeys<ManifestAction<TManifest, TInvocableKey>["return"]>
    : TInvocableKey extends AvailableLoaders<TManifest>
      ? DotNestedKeys<ManifestLoader<TManifest, TInvocableKey>["return"]>
    : never,
  TPayload extends Invoke<TManifest, TInvocableKey, TFuncSelector>,
>(key: TInvocableKey) =>
(
  props?: Invoke<TManifest, TInvocableKey, TFuncSelector>["props"],
  init?: InvokerRequestInit | undefined,
): Promise<
  InvokeResult<
    TPayload,
    TManifest
  >
> => invokeKey(key, props, init);

/**
 * Creates a set of strongly-typed utilities to be used across the repositories where pointing to an existing function is supported.
 */
export const withManifest = <TManifest extends AppManifest>() => {
  return {
    /**
     * Invokes the target function using the invoke api.
     */
    invoke: invoke<TManifest>(),
    /**
     * Creates an invoker function. Usage:
     *
     * const myAction = create('path/to/action');
     * ...
     * const result = await myAction(props);
     */
    create: create<TManifest>(),
  };
};

type InvocationProxyWithBatcher<TManifest extends AppManifest> =
  & InvocationProxy<
    TManifest
  >
  & ReturnType<typeof invoke<TManifest>>;
/**
 * Creates a proxy that lets you invoke functions based on the declared actions and loaders.
 * @returns the created proxy.
 */
export const proxyFor = <TManifest extends AppManifest>(
  invoker: typeof batchInvoke,
): InvocationProxyWithBatcher<
  TManifest
> => {
  return new Proxy<InvocationProxyHandler>(
    invoker as InvocationProxyHandler,
    newHandler<TManifest>((key, props, init) => invoker({ key, props }, init)),
  ) as unknown as InvocationProxyWithBatcher<
    TManifest
  >;
};
/**
 * Creates a proxy that lets you invoke functions based on the declared actions and loaders.
 * @returns the created proxy.
 */
export const proxy = <
  TManifest extends AppManifest,
>(fetcher?: typeof fetch): InvocationProxyWithBatcher<
  TManifest
> => {
  return proxyFor(invoke<TManifest>(fetcher) as typeof batchInvoke);
};

/**
 * Creates a proxy that lets you invoke functions based on the declared actions and loaders. (compatibility with old invoke)
 */
export const forApp = <
  TApp extends App,
>() => {
  const { create } = withManifest<ManifestOf<TApp>>();
  return {
    create: create,
    invoke: proxy<
      ManifestOf<TApp>
    >(),
  };
};
