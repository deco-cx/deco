// deno-lint-ignore-file no-explicit-any
import type { UnPromisify } from "../engine/core/utils.ts";
import type { DecoManifest } from "../types.ts";

export type GenericFunction = (...args: any[]) => Promise<any>;
export type FunctionTypeOf<
  TLoader extends keyof TManifest["functions"] & string,
  TManifest extends DecoManifest,
> = TManifest["functions"][TLoader] extends { default: infer TLoader }
  ? TLoader extends
    (req: any, ctx: any, props: infer Props) => Promise<{ data: infer TReturn }>
    ? (p: Props) => Promise<TReturn>
  : GenericFunction
  : GenericFunction;

export const withManifest = <TManifest extends DecoManifest>() => {
  return {
    invokeLoader: async <
      TLoader extends keyof TManifest["functions"] & string,
      TLoaderFunc extends FunctionTypeOf<TLoader, TManifest> = FunctionTypeOf<
        TLoader,
        TManifest
      >,
    >(
      loader: TLoader,
      props: Partial<Parameters<TLoaderFunc>[number]>,
    ): Promise<UnPromisify<ReturnType<TLoaderFunc>>> => {
      const response = await fetch(`/live/loaders/${loader}`, {
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
    },
  };
};
