// deno-lint-ignore-file no-explicit-any
import { HttpContext } from "../blocks/handler.ts";
import { DeepPartial, OptionalKeys, RequiredKeys, TsType, TsTypeReference } from "../deps.ts";
import { Block, BlockModule, InstanceOf } from "../engine/block.ts";
import { PromiseOrValue } from "../engine/core/utils.ts";
import { deepMergeArr } from "../utils/object.ts";
import { FnProps, applyProps, fnContextFromHttpContext } from "./utils.tsx";

export type ObjectExtension<T, TBase, IsParentOptional> = {
  [key in keyof T]?: ExtensionOf<
    Required<T>[key],
    TBase,
    IsParentOptional extends true ? true
      : key extends RequiredKeys<T> ? false
      : true,
    key extends OptionalKeys<T> ? true
      : Required<T>[key] extends undefined ? true
      : false
  >;
};
export type ArrayExtension<E, TBase, Optional> = {
  _forEach: ExtensionOf<E, TBase, Optional>;
};
export type ExtFunc<
  T,
  TBase,
  IsParentOptional,
  PropIsOptional = IsParentOptional,
> = (
  arg: TBase,
  current: IsParentOptional extends true ? T | undefined : T,
) => PromiseOrValue<
  PropIsOptional extends false ? DeepPartial<T> : DeepPartial<T> | undefined
>;

export type ExtensionOf<
  T = any,
  TBase = T,
  IsParentOptional = T extends undefined | null ? true : false,
  PropIsOptional = IsParentOptional,
> = T extends Record<string, any> ? T extends (infer E)[] ?
      | ExtFunc<T, TBase, IsParentOptional, PropIsOptional>
      | ObjectExtension<T, TBase, IsParentOptional>
      | ArrayExtension<
        E,
        TBase,
        E extends undefined | null ? true : false
      >
  :
    | ObjectExtension<T, TBase, IsParentOptional>
    | ExtFunc<T, TBase, IsParentOptional, PropIsOptional>
  : ExtFunc<T, TBase, IsParentOptional, PropIsOptional>;

export const isObjectExtension = <
  TData,
  TBase,
  IsParentOptional = TData extends undefined | null ? true : false,
>(
  e:
    | ObjectExtension<TData, TBase, IsParentOptional>
    | ArrayExtension<TData, TBase, IsParentOptional>
    | ExtFunc<TData, TBase, IsParentOptional>,
): e is ObjectExtension<TData, TBase, IsParentOptional> => {
  return (typeof e) !== "function" &&
    (e as ArrayExtension<TData, TBase, IsParentOptional>)?._forEach ===
      undefined;
};
export const isArrayExtension = <
  TData,
  TBase,
  IsParentOptional = TData extends undefined | null ? true : false,
>(
  e:
    | ObjectExtension<TData, TBase, IsParentOptional>
    | ArrayExtension<TData, TBase, IsParentOptional>
    | ExtFunc<TData, TBase, IsParentOptional>,
): e is ArrayExtension<TData, TBase, IsParentOptional> => {
  return (typeof e) !== "function" &&
    (e as ArrayExtension<TData, TBase, IsParentOptional>)?._forEach !==
      undefined;
};

export const isExtensionFunc = <
  TData,
  TBase,
  IsParentOptional = TData extends undefined | null ? true : false,
>(
  e:
    | ObjectExtension<TData, TBase, IsParentOptional>
    | ArrayExtension<TData, TBase, IsParentOptional>
    | ExtFunc<TData, TBase, IsParentOptional>,
): e is ExtFunc<TData, TBase, IsParentOptional> => {
  return (typeof e) === "function";
};
export type Extension = InstanceOf<typeof extensionBlock, "#/root/extensions">;

const _extend = async <TData, TBase = TData>(
  extension: ExtensionOf<TData, TBase>,
  base: TBase,
  data: TData,
): Promise<DeepPartial<TData> | undefined> => {
  if (isExtensionFunc(extension)) {
    return extension(base, data);
  }
  if (isArrayExtension(extension) && Array.isArray(data)) {
    return await Promise.all(
      data.map((element) => _extend(extension._forEach, base, element)),
    ) as DeepPartial<TData>;
  }
  if (isObjectExtension(extension)) {
    const keysPromises: Promise<
      [keyof TData, TData[keyof TData] | undefined]
    >[] = [];
    for (const [key, value] of Object.entries(extension)) {
      const extended = _extend(value, base, data?.[key as keyof TData]);
      keysPromises.push(
        extended.then(
          (partial) => [
            key as keyof TData,
            partial as TData[keyof TData] | undefined,
          ],
        ),
      );
    }
    const keys = await Promise.all(keysPromises);
    return Object.fromEntries(keys) as DeepPartial<TData>;
  }
  return undefined;
};
export interface Extended<T> {
  value: DeepPartial<T> | undefined;
  merged: () => T;
}

export const extend = async <TData>(
  extension: ExtensionOf<TData>,
  data: TData,
): Promise<Extended<TData>> => {
  const innerValue = await (Array.isArray(data)
    ? (Promise.all(
      data.map((dataElement) => _extend(extension, dataElement, dataElement)),
    ) as Promise<DeepPartial<TData>>)
    : _extend(extension, data, data));
  return {
    value: innerValue,
    merged: () => innerValue ? deepMergeArr<TData>(data, innerValue) : data,
  };
};

export type ExtensionFunc<TConfig = any, TData = any> = FnProps<
  TConfig,
  ExtensionOf<TData>
>;

export type ExtensionModule = BlockModule<
  ExtensionFunc,
  ExtensionOf,
  <TData>(data: TData) => Promise<Extended<TData>>
>;

const extensionBlock: Block<
  ExtensionModule
> = {
  type: "extensions",
  introspect: {
    includeReturn: (tsType: TsType) => {
      return (tsType as TsTypeReference)?.typeParams?.params?.[0];
    },
  },
  adapt: <
    TConfig = any,
    TData = any,
  >(mod: ExtensionModule) =>
  async (
    $live: TConfig,
    ctx: HttpContext<{ global: any; response: { headers: Headers } }>,
  ) => {
    const ext = applyProps(mod);
    const extension = await ext($live, fnContextFromHttpContext(ctx));
    return (data: TData) => {
      return extend(extension, data);
    };
  },
};

export default extensionBlock;
