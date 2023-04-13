// deno-lint-ignore-file no-explicit-any
import { HandlerContext } from "$fresh/src/server/types.ts";
import { Resolvable } from "$live/engine/core/resolver.ts";
import dfs from "$live/engine/fresh/defaults.ts";
import { LiveConfig } from "$live/mod.ts";
import type { DecoManifest, LiveState } from "$live/types.ts";
import { bodyFromUrl } from "$live/utils/http.ts";
import { DotNestedKeys, PickPath } from "$live/utils/object.ts";

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
  TFunc extends ManifestFunction<TManifest, TLoader> = ManifestFunction<
    TManifest,
    TLoader
  >,
  TSelector extends DotNestedKeys<
    TFunc["return"]
  > = DotNestedKeys<TFunc["return"]>,
> {
  key: TLoader | `#${string}`;
  props?: Partial<TFunc["props"]>;
  select?: TSelector[];
}

export interface InvokeLoader<
  TManifest extends DecoManifest = DecoManifest,
  TLoader extends keyof TManifest["loaders"] & string =
    & keyof TManifest["loaders"]
    & string,
  TFunc extends ManifestLoader<TManifest, TLoader> = ManifestLoader<
    TManifest,
    TLoader
  >,
  TSelector extends DotNestedKeys<
    TFunc["return"]
  > = DotNestedKeys<TFunc["return"]>,
> {
  key: TLoader | `#${string}`;
  props?: Partial<TFunc["props"]>;
  select?: TSelector[];
}

export type InvokePayload<
  TManifest extends DecoManifest = DecoManifest,
  TLoader extends AvailableLoaders<TManifest> | AvailableFunctions<TManifest> =
    | AvailableLoaders<TManifest>
    | AvailableFunctions<TManifest>,
> = TLoader extends AvailableLoaders<TManifest> ? 
    | InvokeLoader<TManifest, TLoader>
    | Record<string, InvokeLoader<TManifest, TLoader>>
  : TLoader extends AvailableFunctions<TManifest> ? 
      | InvokeFunction<TManifest, TLoader>
      | Record<string, InvokeFunction<TManifest, TLoader>>
  : unknown;

type ReturnWith<TRet, TPayload> = TPayload extends
  { select: (infer Selector)[] }
  ? Selector extends DotNestedKeys<TRet> ? PickPath<TRet, Selector>
  : Partial<TRet>
  : TRet;

export type InvokeResult<
  TPayload extends
    | InvokeFunction<TManifest, any, any, any>
    | InvokeLoader<TManifest, any, any, any>
    | Record<
      string,
      | InvokeFunction<TManifest, any, any, any>
      | InvokeLoader<TManifest, any, any, any>
    >,
  TManifest extends DecoManifest = DecoManifest,
> = TPayload extends InvokeFunction<TManifest, infer TFunc, any, any>
  ? ReturnWith<ManifestFunction<TManifest, TFunc>["return"], TPayload>
  : TPayload extends InvokeLoader<TManifest, infer TLoader, any, any>
    ? ReturnWith<ManifestLoader<TManifest, TLoader>["return"], TPayload>
  : TPayload extends Record<string, any> ? {
      [key in keyof TPayload]: TPayload[key] extends
        InvokeFunction<TManifest, infer TFunc>
        ? ReturnWith<ManifestFunction<TManifest, TFunc>["return"], TPayload>
        : TPayload[key] extends InvokeLoader<TManifest, infer TFunc>
          ? ReturnWith<ManifestLoader<TManifest, TFunc>["return"], TPayload>
        : unknown;
    }
  : unknown;
export const sanitizer = (str: string | `#${string}`) =>
  str.startsWith("#") ? str.substring(1) : str;

const isInvokeFunc = (
  p: InvokePayload<any> | InvokeFunction,
): p is InvokeFunction => {
  return (p as InvokeFunction).key !== undefined;
};

const payloadToResolvable = (
  p: InvokePayload<any>,
): Resolvable => {
  if (isInvokeFunc(p)) {
    return {
      keys: p.select,
      obj: {
        props: p.props,
        resolveType: sanitizer(p.key),
        __resolveType: dfs["runWithMergedProps"].name,
      },
      __resolveType: dfs["selectKeys"].name,
    };
  }

  const resolvable: Resolvable = {
    __resolveType: "resolve",
  };

  for (const [prop, invoke] of Object.entries(p)) {
    resolvable[prop] = payloadToResolvable(invoke);
  }
  return resolvable;
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
