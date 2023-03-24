import { applyConfig } from "$live/blocks/utils.ts";
import JsonViewer from "$live/blocks/utils.tsx";
import { Block, InstanceOf } from "$live/engine/block.ts";

// deno-lint-ignore no-empty-interface
export interface Account {}

export type Accounts = InstanceOf<typeof accountBlock, "#/root/accounts">;

// deno-lint-ignore no-explicit-any
export type AccountFunc<TConfig = any> = (c: TConfig) => Account;

const accountBlock: Block<AccountFunc> = {
  type: "accounts",
  introspect: {
    default: "0",
  },
  adapt: applyConfig,
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
