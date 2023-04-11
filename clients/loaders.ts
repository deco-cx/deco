import { UnPromisify } from "../engine/core/utils.ts";
import { DecoManifest } from "../types.ts";
import { GenericFunction, genericInvoker } from "./withManifest.ts";

export type LoaderTypeOf<
  TLoader extends keyof TManifest["loaders"] & string,
  TManifest extends DecoManifest,
> = TManifest["loaders"][TLoader] extends { default: infer TLoader }
  ? TLoader extends (
    // deno-lint-ignore no-explicit-any
    req: any,
    ctx: { state: { $live: infer Props } },
  ) => Promise<{ data: infer TReturn }> ? (p: Props) => Promise<TReturn>
  : unknown
  : unknown;

/**
 * Receives the loader id as a parameter (e.g `#LOADER_ID`, the `#` will be ignored)
 * or the loader name as a parameter (e.g `deco-sites/std/loaders/vtexProductList.ts`) and invoke the target loader passing the provided `props` as the partial input for the function.
 * @returns the loader return.
 */
export const invokeFor = <TManifest extends DecoManifest>() =>
<
  TFunc extends keyof TManifest["functions"] & string,
  TLoaderFunc extends LoaderTypeOf<TFunc, TManifest> = LoaderTypeOf<
    TFunc,
    TManifest
  >,
>(
  func: TFunc | `#${string}`,
  props?: TLoaderFunc extends GenericFunction
    ? Partial<Parameters<TLoaderFunc>[number]>
    : unknown,
): TLoaderFunc extends GenericFunction
  ? Promise<UnPromisify<ReturnType<TLoaderFunc>>>
  : unknown => {
  const result = genericInvoker(func, props);
  return result as TLoaderFunc extends GenericFunction
    ? Promise<UnPromisify<ReturnType<TLoaderFunc>>>
    : unknown;
};
