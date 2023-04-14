// deno-lint-ignore-file no-explicit-any
import type {
  InvokeFunction,
  InvokeLoader,
  InvokeResult,
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
export const invoke = <
  TManifest extends DecoManifest,
>() =>
<
  TPayload extends
    | InvokeFunction<TManifest>
    | InvokeLoader<TManifest>
    | Record<
      string,
      | InvokeFunction<TManifest>
      | InvokeLoader<TManifest>
    >,
>(
  payload: TPayload,
): Promise<
  InvokeResult<
    TPayload,
    TManifest
  >
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
    invoke: invoke<
      TManifest
    >(),
  };
};
