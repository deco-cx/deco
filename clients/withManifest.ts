// deno-lint-ignore-file no-explicit-any
import type { DecoManifest } from "../types.ts";
import { invokeFor as invokeFunctionFor } from "./functions.ts";
import { invokeFor as invokeLoaderFor } from "./loaders.ts";

export type GenericFunction = (...args: any[]) => Promise<any>;

export const sanitizer = (str: string) =>
  str.startsWith("#") ? str.substring(1) : str;

/**
 * Invokes the target function using the live API.
 * @param func the function name or id
 * @param props the function properties.
 * @returns the result of the function call.
 */
export const genericInvoker = async <TProps = any, TReturn = any>(
  func: string | `#${string}`,
  props?: TProps,
): Promise<TReturn> => {
  const response = await fetch(`/live/invoke/${sanitizer(func)}`, {
    headers: {
      "accept": "application/json",
    },
    method: "POST",
    body: JSON.stringify(props ?? {}),
  });

  if (response.ok) {
    return response.json();
  }

  console.error(props, response);
  throw new Error(`${response.status}, ${JSON.stringify(props)}`);
};
/**
 * Creates a set of strongly-typed utilities to be used across the repositories where pointing to an existing function is supported.
 */
export const withManifest = <TManifest extends DecoManifest>() => {
  return {
    /**
     * Invokes the target function using the invoke api.
     */
    invokeFunction: invokeFunctionFor<TManifest>(),
    /**
     * Invokes the target loaders using its invoke api.
     */
    invokeLoader: invokeLoaderFor<TManifest>(),
  };
};
