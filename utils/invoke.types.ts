// deno-lint-ignore-file no-explicit-any
import type { AppManifest } from "../blocks/app.ts";
import {
  AvailableInvocations,
  InvocationFuncFor,
} from "../clients/withManifest.ts";
import type { UnionToIntersection } from "../deps.ts";
import type { PromiseOrValue } from "../engine/core/utils.ts";
import type { DeepPick, DotNestedKeys } from "./object.ts";

export type { AvailableInvocations, InvocationFuncFor };

type AppsOf<TManifest extends AppManifest> = (
  AvailableInvocations<TManifest>
) extends `${infer app}/${"loaders" | "actions" | "functions"}/${string}` ? app
  : never;
type PathToDots<
  TRest extends string,
  Current extends string,
  TManifest extends AppManifest,
> = TRest extends `${infer part}/${infer rest}`
  ? { [key in part]: PathToDots<rest, `${Current}/${part}`, TManifest> }
  : TRest extends `${infer name}.ts`
    ? { [key in name]: InvocationFuncFor<TManifest, `${Current}/${TRest}`> }
  : TRest extends `${infer name}.tsx` ? {
      [key in name]: {
        "x": InvocationFuncFor<TManifest, `${Current}/${TRest}`>;
      };
    }
  : { [key in TRest]: InvocationFuncFor<TManifest, `${Current}/${TRest}`> };

type AllTypesOf<TManifest extends AppManifest, App extends string> =
  AvailableInvocations<TManifest> & `${App}/${string}` extends
    `${App}/${infer type}/${string}` ? type
    : never;

export interface InvokeAsPayload<
  TManifest extends AppManifest,
  TInvocableKey extends string,
  TFuncSelector extends DotNestedKeys<
    ManifestInvocable<TManifest, TInvocableKey>["return"]
  >,
> {
  payload: Invoke<TManifest, TInvocableKey, TFuncSelector>;
}

type InvocationObj<TManifest extends AppManifest> = {
  [app in AppsOf<TManifest>]: {
    [type in AllTypesOf<TManifest, app>]:
      AvailableInvocations<TManifest> & `${app}/${type}/${string}` extends
        `${app}/${type}/${infer rest}` ? UnionToIntersection<
          PathToDots<
            rest,
            `${app}/${type}`,
            TManifest
          >
        >
        : never;
  };
};

export type InvocationProxy<TManifest extends AppManifest> = InvocationObj<
  TManifest
>;

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
    | InvokeAsPayload<TManifest, any, any>
    | Record<
      string,
      Invoke<TManifest, any, any> | InvokeAsPayload<TManifest, any, any>
    >,
  TManifest extends AppManifest = AppManifest,
> = TPayload extends
  | Invoke<TManifest, infer TFunc, any>
  | InvokeAsPayload<TManifest, infer TFunc, any>
  ? ReturnWith<ManifestInvocable<TManifest, TFunc>["return"], TPayload>
  : TPayload extends Record<string, any> ? {
      [key in keyof TPayload]: TPayload[key] extends
        | Invoke<TManifest, infer TFunc, any>
        | InvokeAsPayload<TManifest, infer TFunc, any> ? ReturnWith<
          ManifestInvocable<TManifest, TFunc>["return"],
          TPayload[key]
        >
        : unknown;
    }
  : unknown;
