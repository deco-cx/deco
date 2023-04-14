// deno-lint-ignore-file no-explicit-any
import JsonViewer from "$live/components/JsonViewer.tsx";
import { Block, BlockModule, InstanceOf } from "$live/engine/block.ts";
import { PromiseOrValue } from "../engine/core/utils.ts";

export type Extensions = InstanceOf<typeof extensionBlock, "#/root/extensions">;

export type ExtensionFunc<TConfig = any, TData = any> = (
  data: TData,
  config: TConfig,
) => PromiseOrValue<TData>;

const extensionBlock: Block<
  BlockModule<
    ExtensionFunc,
    (value: any) => PromiseOrValue<typeof value>,
    (value: any) => PromiseOrValue<typeof value>
  >
> = {
  type: "extensions",
  introspect: {
    default: "1",
  },
  adapt: <
    TConfig = any,
    TData = any,
  >(func: {
    default: ExtensionFunc<TConfig, TData>;
  }) =>
  ($live: TConfig) => {
    return (data: TData) => {
      return func.default(data, $live);
    };
  },
  defaultPreview: (data) => {
    return {
      Component: JsonViewer,
      props: { body: JSON.stringify(data, null, 2) },
    };
  },
};

export default extensionBlock;
