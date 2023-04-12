// deno-lint-ignore-file no-explicit-any
import type {
  InvokeFunction,
  InvokeLoader,
} from "$live/routes/live/invoke/index.ts";
import {
  ManifestFunction,
  ManifestLoader,
} from "$live/routes/live/invoke/index.ts";
import type { DecoManifest } from "../types.ts";

export type GenericFunction = (...args: any[]) => Promise<any>;

const genericInvoke = async (payload: unknown) => {
  const response = await fetch(`/live/invoke`, {
    headers: {
      "accept": "application/json",
    },
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (response.ok) {
    return response.json();
  }

  console.error(payload, response);
  throw new Error(`${response.status}, ${JSON.stringify(payload)}`);
};

/**
 * Receives the function id as a parameter (e.g `#FUNC_ID`, the `#` will be ignored)
 * or the function name as a parameter (e.g `deco-sites/std/functions/vtexProductList.ts`) and invoke the target function passing the provided `props` as the partial input for the function.
 * @returns the function return.
 */
export const invokeFunc = <
  TManifest extends DecoManifest,
>() =>
<
  TFunc extends keyof TManifest["functions"] & string,
>(
  payload: InvokeFunction<TManifest, TFunc>,
): Promise<
  ManifestFunction<TManifest, TFunc>["return"]
> => {
  return genericInvoke(payload);
};

/**
 * Receives the function id as a parameter (e.g `#FUNC_ID`, the `#` will be ignored)
 * or the function name as a parameter (e.g `deco-sites/std/functions/vtexProductList.ts`) and invoke the target function passing the provided `props` as the partial input for the function.
 * @returns the function return.
 */
export const invokeLoader = <
  TManifest extends DecoManifest,
>() =>
<
  TFunc extends keyof TManifest["loaders"] & string,
>(
  payload: InvokeLoader<TManifest, TFunc>,
): Promise<
  ManifestLoader<TManifest, TFunc>["return"]
> => {
  return genericInvoke(payload);
};

/**
 * Creates a set of strongly-typed utilities to be used across the repositories where pointing to an existing function is supported.
 */
export const withManifest = <TManifest extends DecoManifest>() => {
  return {
    /**
     * Invokes the target function using the invoke api.
     */
    invokeFunction: invokeFunc<
      TManifest
    >(),
    /**
     * Invokes the target loaders using its invoke api.
     */
    invokeLoader: invokeFunc<TManifest>(),
  };
};
