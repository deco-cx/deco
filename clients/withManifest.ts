// deno-lint-ignore-file no-explicit-any
import type { DecoManifest } from "../types.ts";
import { invokeFor as invokeFunctionFor } from "./functions.ts";
import { invokeFor as invokeLoaderFor } from "./loaders.ts";

export type GenericFunction = (...args: any[]) => Promise<any>;

export const sanitizer = (str: string) =>
  str.startsWith("#") ? str.substring(1) : str;

export const genericInvoker = async <TProps = any, TReturn = any>(
  func: string,
  props: TProps,
): Promise<TReturn> => {
  const response = await fetch(`/live/invoke/${sanitizer(func)}`, {
    headers: {
      "accept": "application/json",
    },
    method: "POST",
    body: JSON.stringify(props),
  });

  if (response.ok) {
    return response.json();
  }

  console.error(props, response);
  throw new Error(`${response.status}, ${JSON.stringify(props)}`);
};
export const withManifest = <TManifest extends DecoManifest>() => {
  return {
    invokeFunction: invokeFunctionFor<TManifest>(),
    invokeLoader: invokeLoaderFor<TManifest>(),
  };
};
