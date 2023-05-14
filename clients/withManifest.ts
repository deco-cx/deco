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
import { DotNestedKeys } from "$live/utils/object.ts";
import type { DecoManifest } from "../types.ts";

export type GenericFunction = (...args: any[]) => Promise<any>;

const fetchJSON = async (
  input: URL | RequestInfo,
  init?: RequestInit | undefined,
) => {
  const headers = new Headers(init?.headers);

  headers.set("accept", "application/json");
  headers.set("content-type", "application/json");

  const response = await fetch(input, {
    method: "POST",
    ...init,
    headers,
  });

  if (response.status === 204) {
    return;
  }

  if (response.ok) {
    return response.json();
  }

  console.error(init?.body, response);
  throw new Error(`${response.status}, ${init?.body}`);
};

const invokeKey = (key: string, props?: unknown) =>
  fetchJSON(`/live/invoke/${key}`, {
    body: JSON.stringify(props ?? {}),
  });

const batchInvoke = (payload: unknown) =>
  fetchJSON(`/live/invoke`, {
    body: JSON.stringify(payload),
  });

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
): Promise<
  InvokeResult<
    TPayload,
    TManifest
  >
> => batchInvoke(payload);

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
): Promise<
  InvokeResult<
    TPayload,
    TManifest
  >
> => invokeKey(key, props);

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
