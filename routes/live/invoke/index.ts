// deno-lint-ignore-file no-explicit-any
import { HandlerContext } from "$fresh/src/server/types.ts";
import { AppManifest } from "$live/blocks/app.ts";
import { Resolvable } from "$live/engine/core/resolver.ts";
import { PromiseOrValue } from "$live/engine/core/utils.ts";
import dfs from "$live/engine/fresh/defaults.ts";
import type { Manifest } from "$live/live.gen.ts";
import { LiveConfig } from "$live/mod.ts";
import type { LiveState } from "$live/types.ts";
import { bodyFromUrl } from "$live/utils/http.ts";
import { invokeToHttpResponse } from "$live/utils/invoke.ts";
import { DeepPick, DotNestedKeys } from "$live/utils/object.ts";
import { UnionToIntersection } from "https://esm.sh/utility-types@3.10.0";

export type AvailableFunctions<TManifest extends AppManifest> =
  & keyof TManifest["functions"]
  & string;

export type AvailableActions<TManifest extends AppManifest> =
  & keyof TManifest["actions"]
  & string;

export type AvailableLoaders<TManifest extends AppManifest> =
  & keyof TManifest["loaders"]
  & string;

export type ManifestFunction<
  TManifest extends AppManifest,
  TFunc extends string,
> = TFunc extends AvailableFunctions<TManifest>
  ? TManifest["functions"][TFunc] extends { default: infer TLoader }
    ? TLoader extends (
      req: any,
      ctx: any,
      props: infer Props,
    ) => PromiseOrValue<{ data: infer TReturn }>
      ? { props: Props; return: TReturn }
    : never
  : never
  : never;

export type ManifestLoader<
  TManifest extends AppManifest,
  TLoader extends string,
> = TLoader extends AvailableLoaders<TManifest>
  ? TManifest["loaders"][TLoader] extends { default: infer TLoader }
    ? TLoader extends (
      props: infer Props,
      req: Request,
      _ctx: any,
    ) => PromiseOrValue<infer TReturn> ? { props: Props; return: TReturn }
    : never
  : never
  : never;

export type ManifestAction<
  TManifest extends AppManifest,
  TAction extends string,
> = TAction extends AvailableActions<TManifest>
  ? TManifest["actions"][TAction] extends { default: infer TAction }
    ? TAction extends (
      props: infer Props,
      req: Request,
      _ctx: any,
    ) => PromiseOrValue<infer TReturn> ? { props: Props; return: TReturn }
    : never
  : never
  : never;

export type ManifestInvocable<
  TManifest extends AppManifest,
  TKey extends string,
> =
  | ManifestAction<TManifest, TKey>
  | ManifestLoader<TManifest, TKey>
  | ManifestFunction<TManifest, TKey>;

export interface InvokeAction<
  TManifest extends AppManifest = AppManifest,
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
  TManifest extends AppManifest = AppManifest,
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
  TManifest extends AppManifest,
  TInvocableKey extends string,
  TFuncSelector extends DotNestedKeys<
    ManifestInvocable<TManifest, TInvocableKey>["return"]
  >,
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
  : TInvocableKey extends AvailableLoaders<TManifest> ? InvokeLoader<
      TManifest,
      TInvocableKey,
      ManifestLoader<TManifest, TInvocableKey>,
      TFuncSelector
    >
  : never;

export interface InvokeLoader<
  TManifest extends AppManifest = AppManifest,
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
  TManifest extends AppManifest = AppManifest,
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

export type DotNestedReturn<
  TManifest extends AppManifest,
  TInvocableKey extends string,
> = DotNestedKeys<ManifestInvocable<TManifest, TInvocableKey>["return"]>;

export type InvokeResult<
  TPayload extends
    | Invoke<TManifest, any, any>
    | Record<
      string,
      Invoke<TManifest, any, any>
    >,
  TManifest extends AppManifest = AppManifest,
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

export const payloadForFunc = (
  func: InvokeFunction<Manifest>,
) => ({
  keys: func.select,
  obj: {
    props: func.props,
    block: sanitizer(func.key),
    __resolveType: dfs["invoke"].name,
  },
  __resolveType: dfs["selectKeys"].name,
});

export const payloadToResolvable = (
  p: InvokePayload<any>,
): Resolvable => {
  if (isInvokeFunc(p)) {
    return payloadForFunc(p);
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
): Promise<Response> => {
  const { state: { resolve } } = ctx;
  const data = req.method === "POST"
    ? await req.json()
    : bodyFromUrl("body", new URL(req.url));

  const isInvoked = isInvokeFunc(data);

  const wrapped = isInvoked ? { invoked: data } : data;
  const result = await resolve(payloadToResolvable(wrapped));
  const unwrapped = isInvoked ? result.invoked : result;

  return invokeToHttpResponse(req, unwrapped);
};
