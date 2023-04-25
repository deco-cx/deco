// deno-lint-ignore-file no-explicit-any
import { HandlerContext } from "$fresh/src/server/types.ts";
import { Resolvable } from "$live/engine/core/resolver.ts";
import { PromiseOrValue } from "$live/engine/core/utils.ts";
import dfs from "$live/engine/fresh/defaults.ts";
import { LiveConfig } from "$live/mod.ts";
import type { DecoManifest, LiveState } from "$live/types.ts";
import { bodyFromUrl } from "$live/utils/http.ts";
import { DeepPick, DotNestedKeys } from "$live/utils/object.ts";
import { UnionToIntersection } from "https://esm.sh/utility-types@3.10.0";
import { ActionContext, LoaderContext } from "$live/types.ts";

export type AvailableFunctions<TManifest extends DecoManifest> =
  & keyof TManifest["functions"]
  & string;

export type AvailableActions<TManifest extends DecoManifest> =
  & keyof TManifest["actions"]
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
  ) => PromiseOrValue<{ data: infer TReturn }>
    ? { props: Props; return: TReturn }
  : never
  : never;

export type ManifestLoader<
  TManifest extends DecoManifest,
  TLoader extends AvailableLoaders<TManifest>,
> = TManifest["loaders"][TLoader] extends { default: infer TLoader }
  ? TLoader extends (
    req: any,
    ctx: LoaderContext<infer Props>,
  ) => PromiseOrValue<infer TReturn> ? { props: Props; return: TReturn }
  : never
  : never;

export type ManifestAction<
  TManifest extends DecoManifest,
  TAction extends AvailableActions<TManifest>,
> = TManifest["actions"][TAction] extends { default: infer TAction }
  ? TAction extends (
    req: any,
    ctx: ActionContext<infer Props>,
  ) => PromiseOrValue<infer TReturn> ? { props: Props; return: TReturn }
  : never
  : never;

export type ManifestInvocable<TManifest extends DecoManifest, TKey> =
  TKey extends AvailableLoaders<TManifest> ? ManifestLoader<TManifest, TKey>
    : TKey extends AvailableFunctions<TManifest>
      ? ManifestFunction<TManifest, TKey>
    : TKey extends AvailableActions<TManifest> ? ManifestAction<TManifest, TKey>
    : never;

export interface InvokeAction<
  TManifest extends DecoManifest = DecoManifest,
  TAction extends AvailableActions<TManifest> = AvailableActions<TManifest>,
  TFunc extends ManifestAction<TManifest, TAction> = ManifestAction<
    TManifest,
    TAction
  >,
  TSelector extends DotNestedKeys<
    TFunc["return"]
  > = DotNestedKeys<TFunc["return"]>,
> {
  key: TAction | `#${string}`;
  props?: Partial<TFunc["props"]>;
  select?: TSelector[];
}

export interface InvokeFunction<
  TManifest extends DecoManifest = DecoManifest,
  TLoader extends AvailableFunctions<TManifest> = AvailableFunctions<TManifest>,
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

export type Invoke<
  TManifest extends DecoManifest,
  TInvocableKey extends (
    | AvailableFunctions<TManifest>
    | AvailableLoaders<TManifest>
    | AvailableActions<TManifest>
  ),
  TFuncSelector extends TInvocableKey extends AvailableFunctions<TManifest>
    ? DotNestedKeys<ManifestFunction<TManifest, TInvocableKey>["return"]>
    : TInvocableKey extends AvailableActions<TManifest>
      ? DotNestedKeys<ManifestAction<TManifest, TInvocableKey>["return"]>
    : DotNestedKeys<ManifestLoader<TManifest, TInvocableKey>["return"]>,
> = TInvocableKey extends AvailableFunctions<TManifest> ? InvokeFunction<
    TManifest,
    TInvocableKey,
    ManifestFunction<TManifest, TInvocableKey>,
    TFuncSelector
  >
  : TInvocableKey extends AvailableActions<TManifest> ? InvokeAction<
      TManifest,
      TInvocableKey,
      ManifestAction<TManifest, TInvocableKey>,
      TFuncSelector
    >
  : InvokeLoader<
    TManifest,
    TInvocableKey,
    ManifestLoader<TManifest, TInvocableKey>,
    TFuncSelector
  >;

export interface InvokeLoader<
  TManifest extends DecoManifest = DecoManifest,
  TLoader extends AvailableLoaders<TManifest> = AvailableLoaders<TManifest>,
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
  TFunc extends
    | AvailableLoaders<TManifest>
    | AvailableFunctions<TManifest>
    | AvailableActions<TManifest> =
      | AvailableLoaders<TManifest>
      | AvailableFunctions<TManifest>
      | AvailableActions<TManifest>,
> = TFunc extends AvailableLoaders<TManifest> ? 
    | InvokeLoader<TManifest, TFunc>
    | Record<string, InvokeLoader<TManifest, TFunc>>
  : TFunc extends AvailableActions<TManifest> ? 
      | InvokeAction<TManifest, TFunc>
      | Record<string, InvokeAction<TManifest, TFunc>>
  : TFunc extends AvailableFunctions<TManifest> ? 
      | InvokeFunction<TManifest, TFunc>
      | Record<string, InvokeFunction<TManifest, TFunc>>
  : unknown;

type ReturnWith<TRet, TPayload> = TPayload extends
  { select: (infer Selector)[] } ? UnionToIntersection<
    Selector extends DotNestedKeys<TRet> ? DeepPick<TRet, Selector>
      : Partial<TRet>
  >
  : TRet;

export type DotNestedReturn<TManifest extends DecoManifest, TInvocableKey> =
  TInvocableKey extends AvailableFunctions<TManifest>
    ? DotNestedKeys<ManifestFunction<TManifest, TInvocableKey>["return"]>
    : TInvocableKey extends AvailableLoaders<TManifest>
      ? DotNestedKeys<ManifestLoader<TManifest, TInvocableKey>["return"]>
    : TInvocableKey extends AvailableActions<TManifest>
      ? DotNestedKeys<ManifestAction<TManifest, TInvocableKey>["return"]>
    : never;

export type InvokeResult<
  TPayload extends
    | Invoke<TManifest, any, any>
    | Record<
      string,
      Invoke<TManifest, any, any>
    >,
  TManifest extends DecoManifest = DecoManifest,
> = TPayload extends Invoke<TManifest, infer TFunc, any>
  ? ReturnWith<ManifestInvocable<TManifest, TFunc>["return"], TPayload>
  : TPayload extends Record<string, any> ? {
      [key in keyof TPayload]: TPayload[key] extends
        Invoke<TManifest, infer TFunc, any> ? ReturnWith<
          ManifestInvocable<TManifest, TFunc>["return"],
          TPayload[key]
        >
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
