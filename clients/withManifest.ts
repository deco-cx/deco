// deno-lint-ignore-file no-explicit-any
import type {
  AvailableActions,
  AvailableFunctions,
  AvailableLoaders,
  Invoke,
  InvokeResult,
  ManifestAction,
  ManifestFunction,
  ManifestLoader,
} from "$live/routes/live/invoke/index.ts";
import { readFromStream } from "$live/utils/http.ts";
import { DotNestedKeys } from "$live/utils/object.ts";
import type { DecoManifest } from "../types.ts";
import { isStreamProps } from "../utils/invoke.ts";

export type GenericFunction = (...args: any[]) => Promise<any>;

const fetchWithProps = async (
  url: string,
  props: unknown,
  init?: RequestInit | undefined,
) => {
  const headers = new Headers(init?.headers);
  const isStream = isStreamProps(props) && props.stream;

  headers.set(
    "accept",
    `application/json, ${isStream ? "text/event-stream" : ""}`,
  );
  headers.set("content-type", "application/json");

  const response = await fetch(url, {
    method: "POST",
    body: JSON.stringify(props),
    ...init,
    headers,
  });

  if (response.status === 204) {
    return;
  }

  if (response.ok) {
    if (isStream) {
      return readFromStream(response);
    }
    return response.json();
  }

  console.error(init?.body, response);
  const error = await response.text();
  let errorObj;
  try {
    errorObj = JSON.parse(error);
  } catch (_err) {
    throw new Error(`${response.status}: ${response.statusText}`, { cause: error });
  }
  throw new Error(`${response.status}: ${response.statusText}`, { cause: errorObj.message + (errorObj.code ? " - " + errorObj.code : "") });
};

const invokeKey = (
  key: string,
  props?: unknown,
  init?: RequestInit | undefined,
) => fetchWithProps(`/live/invoke/${key}`, props, init);

const batchInvoke = (payload: unknown, init?: RequestInit | undefined) =>
  fetchWithProps(`/live/invoke`, payload, init);

export type InvocationFunc<TManifest extends DecoManifest> = <
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
/**
 * Receives the function id as a parameter (e.g `#FUNC_ID`, the `#` will be ignored)
 * or the function name as a parameter (e.g `deco-sites/std/functions/vtexProductList.ts`) and invoke the target function passing the provided `props` as the partial input for the function.
 * @returns the function return.
 */
export const invoke = <
  TManifest extends DecoManifest,
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
    TPayload extends
    | Invoke<TManifest, TInvocableKey, TFuncSelector>
    | Record<
      string,
      Invoke<TManifest, TInvocableKey, TFuncSelector>
    >,
  >(
    payload: TPayload,
    init?: RequestInit | undefined,
  ): Promise<
    InvokeResult<
      TPayload,
      TManifest
    >
  > => batchInvoke(payload, init);

export const create = <
  TManifest extends DecoManifest,
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
      init?: RequestInit | undefined,
    ): Promise<
      InvokeResult<
        TPayload,
        TManifest
      >
    > => invokeKey(key, props, init);

/**
 * Creates a set of strongly-typed utilities to be used across the repositories where pointing to an existing function is supported.
 */
export const withManifest = <TManifest extends DecoManifest>() => {
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
