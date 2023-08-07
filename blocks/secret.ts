import { HttpContext } from "$live/blocks/handler.ts";
import { Block, BlockModule, InstanceOf } from "$live/engine/block.ts";
import { PromiseOrValue } from "$live/engine/core/utils.ts";
import { FnContext } from "$live/mod.ts";
import { fnContextFromHttpContext } from "./utils.tsx";

export type Secret = InstanceOf<typeof secretBlock, "#/root/secrets">;

// deno-lint-ignore no-explicit-any
export type SecretFunc<TConfig = any> = (c: TConfig, ctx: FnContext) => Vault;
export interface Vault {
  get(): PromiseOrValue<string | null>;
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
    // deno-lint-ignore no-explicit-any
    ctx: HttpContext<{ global: any; response: { headers: Headers } }>,
  ) => {
    return func.default(
      confg,
      fnContextFromHttpContext(ctx),
    );
  },
};

/**
 * <TConfig>(config:TConfig) => Secret
 * A Secret vault that is a function with a callback to use the secret (this avoid being serialized in a island)
 */
export default secretBlock;
