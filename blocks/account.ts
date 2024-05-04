import { applyConfigSync } from "../blocks/utils.tsx";
import JsonViewer from "../components/JsonViewer.tsx";
import { Block, BlockModule, InstanceOf } from "../engine/block.ts";

// deno-lint-ignore no-empty-interface
export interface Account {}

export type Accounts = InstanceOf<typeof accountBlock, "#/root/accounts">;

// deno-lint-ignore no-explicit-any
export type AccountFunc<TConfig = any> = (c: TConfig) => Account;

const accountBlock: Block<BlockModule<AccountFunc>> = {
  type: "accounts",
  adapt: applyConfigSync,
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
