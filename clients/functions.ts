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

export const invokeFor = <TManifest extends DecoManifest>() =>
<
  TFunc extends keyof TManifest["functions"] & string,
  TLoaderFunc extends FunctionTypeOf<TFunc, TManifest> = FunctionTypeOf<
    TFunc,
    TManifest
  >,
>(
  func: TFunc | `#${string}`,
  props: TLoaderFunc extends GenericFunction
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
