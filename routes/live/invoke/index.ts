// deno-lint-ignore-file no-explicit-any
import { HandlerContext } from "$fresh/src/server/types.ts";
import { LiveConfig } from "$live/blocks/handler.ts";
import { Resolvable } from "$live/engine/core/resolver.ts";
import type { DecoManifest, LiveState } from "$live/types.ts";
import { bodyFromUrl } from "$live/utils/http.ts";

export type AvailableFunctions<TManifest extends DecoManifest> =
  & keyof TManifest["functions"]
  & string;
export type AvailableLoaders<TManifest extends DecoManifest> =
  & keyof TManifest["loaders"]
  & string;

export type ManifestFunction<
  TManifest extends DecoManifest,
  TFunc extends AvailableFunctions<TManifest>,
> = TManifest["functions"][TFunc] extends { default: infer TLoader }
  ? TLoader extends (
    req: any,
    ctx: any,
    props: infer Props,
  ) => Promise<{ data: infer TReturn }> ? { props: Props; return: TReturn }
  : never
  : never;

export type ManifestLoader<
  TManifest extends DecoManifest,
  TLoader extends AvailableLoaders<TManifest>,
> = TManifest["loaders"][TLoader] extends { default: infer TLoader }
  ? TLoader extends (
    req: any,
    ctx: { state: { $live: infer Props } },
  ) => Promise<infer TReturn> ? { props: Props; return: TReturn }
  : never
  : never;

export interface InvokeFunction<
  TManifest extends DecoManifest = DecoManifest,
  TLoader extends keyof TManifest["functions"] & string =
    & keyof TManifest["functions"]
    & string,
> {
  key: TLoader | `#${string}`;
  props?: Partial<ManifestFunction<TManifest, TLoader>["props"]>;
}

export interface InvokeLoader<
  TManifest extends DecoManifest = DecoManifest,
  TLoader extends keyof TManifest["loaders"] & string =
    & keyof TManifest["loaders"]
    & string,
> {
  key: TLoader | `#${string}`;
  props?: Partial<ManifestLoader<TManifest, TLoader>["props"]>;
}

export type InvokePayload<
  TManifest extends DecoManifest = DecoManifest,
  TLoader extends AvailableLoaders<TManifest> | AvailableFunctions<TManifest> =
    | AvailableLoaders<TManifest>
    | AvailableFunctions<TManifest>,
> = TLoader extends AvailableLoaders<TManifest>
  ? InvokeLoader<TManifest, TLoader>
  : TLoader extends AvailableFunctions<TManifest>
    ? InvokeFunction<TManifest, TLoader>
  : unknown;

export const sanitizer = (str: string | `#${string}`) =>
  str.startsWith("#") ? str.substring(1) : str;

const isInvokeFunc = (
  p: InvokeFunction | InvokeLoader,
): p is InvokeFunction => {
  return (p as InvokeFunction).key !== undefined;
};

const payloadToResolvable = (
  { props, key }: InvokePayload<any>,
): Resolvable => {
  return {
    props,
    resolveType: sanitizer(key),
    __resolveType: "runWithMergedProps",
  };
};

export const handler = async (
  req: Request,
  ctx: HandlerContext<
    unknown,
    LiveConfig<unknown, LiveState>
  >,
) => {
  const { state: { resolve } } = ctx;
  const data = req.method === "POST"
    ? await req.json()
    : bodyFromUrl("body", new URL(req.url));

  return Response.json(
    await resolve(payloadToResolvable(data)),
  );
};
