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
  : GenericFunction
  : GenericFunction;

export const invokeFor = <TManifest extends DecoManifest>() =>
<
  TFunc extends keyof TManifest["functions"] & string,
  TLoaderFunc extends LoaderTypeOf<TFunc, TManifest> = LoaderTypeOf<
    TFunc,
    TManifest
  >,
>(
  func: TFunc | `#${string}`,
  props: Partial<Parameters<TLoaderFunc>[number]>,
): Promise<UnPromisify<ReturnType<TLoaderFunc>>> => {
  return genericInvoker(func, props);
};
