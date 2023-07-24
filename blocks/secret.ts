import { Block, BlockModule, InstanceOf } from "$live/engine/block.ts";
import { PromiseOrValue } from "$live/engine/core/utils.ts";

export type Secret = InstanceOf<typeof secretBlock, "#/root/secrets">;

// deno-lint-ignore no-explicit-any
export type SecretFunc<TConfig = any> = (c: TConfig) => Vault;
export interface Vault {
  get(): PromiseOrValue<string>;
}

const secretBlock: Block<BlockModule<SecretFunc>> = {
  type: "secrets",
  introspect: {
    default: "0",
  },
  adapt: <
    // deno-lint-ignore no-explicit-any
    TConfig = any,
  >(func: {
    default: SecretFunc<TConfig>;
  }) =>
  (
    confg: TConfig,
  ) => {
    return func.default(
      confg,
    );
  },
};

/**
 * <TConfig>(config:TConfig) => Secret
 * A Secret vault that is a function with a callback to use the secret (this avoid being serialized in a island)
 */
export default secretBlock;
