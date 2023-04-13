// deno-lint-ignore-file no-explicit-any
import {
  PromiseOrValue,
  Promisified,
  waitKeys,
} from "$live/engine/core/utils.ts";
import { LoaderContext } from "$live/types.ts";
import {
  Diff,
  Intersection,
  OptionalKeys,
  Overwrite,
  RequiredKeys,
} from "https://esm.sh/utility-types@3.10.0";

export type LoaderPropFunc<TProps = any, TReturn = any, TState = any> = (
  request: Request,
  ctx: LoaderContext<
    TProps,
    TState
  >,
) => PromiseOrValue<TReturn>;

export type PropsUnion<
  TLoadProps,
  TSectionInput,
> = TSectionInput extends Record<string, any> ? Overwrite<
    {
      [
        key in keyof Diff<
          Required<TSectionInput>,
          Pick<TLoadProps, RequiredKeys<TLoadProps>>
        >
      ]: Diff<
        Required<TSectionInput>,
        Pick<TLoadProps, RequiredKeys<TLoadProps>>
      >[key];
    }, // non-required keys in the input object that are required in the section object are required.
    & {
      [
        key in keyof Intersection<
          Pick<TLoadProps, RequiredKeys<TLoadProps>>,
          Required<TSectionInput>
        >
      ]?: Intersection<
        Pick<TLoadProps, RequiredKeys<TLoadProps>>,
        Required<TSectionInput>
      >[key];
    } // required keys in both are optional in the loader
    & {
      [
        key in keyof Pick<
          TSectionInput,
          OptionalKeys<TSectionInput>
        >
      ]?: Pick<
        TSectionInput,
        OptionalKeys<TSectionInput>
      >[key];
    } // optional keys in the section input are always optional.
  >
  : TSectionInput;

export type ObjectLoader<TLoaderProps, TSectionInput> = {
  [key in keyof PropsUnion<TLoaderProps, TSectionInput>]:
    | PropsUnion<
      TLoaderProps,
      TSectionInput
    >[key]
    | LoaderPropFunc<
      TLoaderProps,
      PropsUnion<
        TLoaderProps,
        TSectionInput
      >[key]
    >;
};
export type PropsLoader<TSectionInput, TLoaderProps = unknown> =
  | ObjectLoader<TLoaderProps, TSectionInput>
  | TSectionInput
  | LoaderPropFunc<TLoaderProps, TSectionInput>;

const isLoaderFunc = <TLoaderProps, TSectionInput>(
  obj:
    | ObjectLoader<TLoaderProps, TSectionInput>
    | TSectionInput
    | LoaderPropFunc<TLoaderProps, TSectionInput>,
): obj is LoaderPropFunc<TLoaderProps, TSectionInput> => {
  return typeof obj === "function";
};

const isObjLoader = <TLoaderProps, TSectionInput>(
  obj:
    | ObjectLoader<TLoaderProps, TSectionInput>
    | TSectionInput
    | LoaderPropFunc<TLoaderProps, TSectionInput>,
): obj is ObjectLoader<TLoaderProps, TSectionInput> => {
  return typeof obj === "object";
};
export const propsLoader = async <TSectionInput, TProps>(
  resolver: PropsLoader<TSectionInput, TProps>,
  ctx: LoaderContext<TProps>,
  req: Request,
): Promise<TSectionInput> => {
  if (isLoaderFunc(resolver)) {
    return await resolver(req, ctx);
  }
  if (!isObjLoader(resolver)) {
    return resolver;
  }
  const resolved = {} as Promisified<TSectionInput>;
  for (const key of Object.keys(resolver)) {
    const keyAsResolvedKey = key as keyof typeof resolved;
    const keyAsResolverKey = key as keyof typeof resolver;
    const funcOrValue = resolver[keyAsResolverKey];
    if (isLoaderFunc(funcOrValue)) {
      const result = funcOrValue(
        req,
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
