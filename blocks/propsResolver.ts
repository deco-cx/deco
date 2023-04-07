// deno-lint-ignore-file no-explicit-any
import { Props } from "$live/components/JsonViewer.tsx";
import { PromiseOrValue, waitKeys } from "$live/engine/core/utils.ts";
import { LoaderContext } from "$live/types.ts";
import {
  Intersection,
  OptionalKeys,
  RequiredKeys,
  Subtract,
} from "https://esm.sh/utility-types";
import { request } from "https://esm.sh/v113/websocket@1.0.34/deno/websocket.mjs";
import { Promisified } from "../engine/core/utils.ts";

export type ResolvePropFunc<TProps = any, TReturn = any, TState = any> = (
  request: Request,
  ctx: LoaderContext<
    TProps,
    TState
  >,
) => PromiseOrValue<TReturn>;
export type PropsUnion<
  TLoadProps,
  TSectionInput,
> = TSectionInput extends Record<string, any>
  ? Required<TSectionInput> extends Pick<TLoadProps, RequiredKeys<TLoadProps>>
    ? 
      & {
        [
          key in keyof Intersection<
            Pick<TLoadProps, RequiredKeys<TLoadProps>>,
            Required<Props>
          >
        ]?: Intersection<
          Pick<TLoadProps, RequiredKeys<TLoadProps>>,
          Required<Props>
        >[key];
      }
      & {
        [
          key in keyof Pick<
            Props,
            OptionalKeys<Props>
          >
        ]?: Pick<
          Props,
          OptionalKeys<Props>
        >[key];
      }
      & {
        [
          key in keyof Subtract<
            Required<TSectionInput>,
            Pick<TLoadProps, RequiredKeys<TLoadProps>>
          >
        ]: Subtract<
          Required<TSectionInput>,
          Pick<TLoadProps, RequiredKeys<TLoadProps>>
        >[key];
      }
  : TSectionInput
  : TSectionInput;

export type ObjectResolver<TLoaderProps, TSectionInput> = {
  [key in keyof PropsUnion<TLoaderProps, TSectionInput>]:
    | PropsUnion<
      TLoaderProps,
      TSectionInput
    >[key]
    | ResolvePropFunc<
      TLoaderProps,
      PropsUnion<
        TLoaderProps,
        TSectionInput
      >[key]
    >;
};
export type PropsResolver<TSectionInput, TLoaderProps = unknown> =
  | ObjectResolver<TLoaderProps, TSectionInput>
  | TSectionInput
  | ResolvePropFunc<TLoaderProps, TSectionInput>;

const isFuncResolver = <TLoaderProps, TSectionInput>(
  obj:
    | ObjectResolver<TLoaderProps, TSectionInput>
    | TSectionInput
    | ResolvePropFunc<TLoaderProps, TSectionInput>,
): obj is ResolvePropFunc<TLoaderProps, TSectionInput> => {
  return typeof obj === "function";
};

const isObjResolver = <TLoaderProps, TSectionInput>(
  obj:
    | ObjectResolver<TLoaderProps, TSectionInput>
    | TSectionInput
    | ResolvePropFunc<TLoaderProps, TSectionInput>,
): obj is ObjectResolver<TLoaderProps, TSectionInput> => {
  return typeof obj === "object";
};
export const propsResolver = async <TSectionInput, TProps>(
  resolver: PropsResolver<TSectionInput, TProps>,
  ctx: LoaderContext<TProps>,
  req: Request,
): Promise<TSectionInput> => {
  if (isFuncResolver(resolver)) {
    return await resolver(req, ctx);
  }
  if (!isObjResolver(resolver)) {
    return resolver;
  }
  const resolved = {} as Promisified<TSectionInput>;
  for (const key of Object.keys(resolver)) {
    const keyAsResolvedKey = key as keyof typeof resolved;
    const keyAsResolverKey = key as keyof typeof resolver;
    const funcOrValue = resolver[keyAsResolverKey];
    if (isFuncResolver(funcOrValue)) {
      const result = funcOrValue(
        request,
        ctx,
      );
      resolved[keyAsResolvedKey] =
        result as typeof resolved[typeof keyAsResolvedKey];
    } else {
      resolved[keyAsResolvedKey] = Promise.resolve(
        resolver[keyAsResolverKey] as typeof resolved[typeof keyAsResolvedKey],
      );
    }
  }

  const awaited = await waitKeys(resolved);
  return { ...ctx.state.$live, ...awaited };
};
