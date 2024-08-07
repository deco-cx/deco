// deno-lint-ignore-file no-explicit-any
import JsonViewer from "../components/JsonViewer.tsx";
import type { Block, BlockModule, InstanceOf } from "../engine/block.ts";

// deno-lint-ignore no-empty-interface
export interface Account {}

export type Accounts = InstanceOf<typeof accountBlock, "#/root/accounts">;

export type AccountFunc<TConfig = any> = (c: TConfig) => Account;

const accountBlock: Block<BlockModule<AccountFunc>> = {
  type: "accounts",
  adapt: <
    TConfig = any,
    TResp = any,
    TFunc extends (c: TConfig) => TResp = any,
  >(func: {
    default: TFunc;
  }) =>
  ($live: TConfig) => {
    return func.default($live);
  },
  defaultPreview: (account) => {
    return {
      Component: JsonViewer,
      props: { body: JSON.stringify(account, null, 2) },
    };
  },
};

/**
 * <TConfig>(config:TConfig) => Account
 * The account block is used to configure platforms using settings
 */
export default accountBlock;
