import { applyConfig, configOnly } from "$live/blocks/utils.ts";
import JsonViewer from "$live/blocks/utils.tsx";
import { Block, InstanceOf } from "$live/engine/block.ts";

const brand = Symbol();

export interface AccountObj {
  [brand]: never;
}

export type Account = InstanceOf<typeof accountBlock, "#/root/account">;

// deno-lint-ignore no-explicit-any
export type AccountFunc<TConfig = any> = (c: TConfig) => AccountObj;

const accountBlock: Block<AccountFunc> = {
  type: "accounts",
  defaultPreview: (account) => {
    return {
      Component: JsonViewer,
      props: { body: JSON.stringify(account, null, 2) },
    };
  },
  introspect: configOnly,
  adapt: applyConfig,
};

/**
 * <TConfig>(config:TConfig) => Account
 * The account block is used to configure platforms using settings
 */
export default accountBlock;
