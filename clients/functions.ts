import { UnPromisify } from "../engine/core/utils.ts";
import { DecoManifest } from "../types.ts";
import { GenericFunction, genericInvoker } from "./withManifest.ts";

export type FunctionTypeOf<
  TLoader extends keyof TManifest["functions"] & string,
  TManifest extends DecoManifest,
> = TManifest["functions"][TLoader] extends { default: infer TLoader }
  ? TLoader extends // deno-lint-ignore no-explicit-any
  (req: any, ctx: any, props: infer Props) => Promise<{ data: infer TReturn }>
    ? (p: Props) => Promise<TReturn>
  : unknown
  : unknown;

/**
 * Receives the function id as a parameter (e.g `#FUNC_ID`, the `#` will be ignored)
 * or the function name as a parameter (e.g `deco-sites/std/functions/vtexProductList.ts`) and invoke the target function passing the provided `props` as the partial input for the function.
 * @returns the function return.
 */
export const invokeFor = <TManifest extends DecoManifest>() =>
<
  TFunc extends keyof TManifest["functions"] & string,
  TLoaderFunc extends FunctionTypeOf<TFunc, TManifest> = FunctionTypeOf<
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
