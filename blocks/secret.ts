import JsonViewer from "$live/components/JsonViewer.tsx";
import { Block, BlockModule, InstanceOf } from "$live/engine/block.ts";
import { PromiseOrValue } from "$live/engine/core/utils.ts";

export type Secret = InstanceOf<typeof secretBlock, "#/root/secrets">;

// deno-lint-ignore no-explicit-any
export type SecretFunc<TConfig = any> = (c: TConfig) => Vault;
export interface Vault {
  use: <TResult = unknown>(
    cb: (key: string) => PromiseOrValue<TResult>,
  ) => PromiseOrValue<TResult>;
}

const vault: Record<string, string> = Deno.env.has("DECO_SECRETS")
  ? {}
  : JSON.parse(atob(Deno.env.get("DECO_SECRETS")!));

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
  ) => { // by default use global state
    return func.default(
      confg,
    );
  },
  defaultPreview: (secret) => {
    return {
      Component: JsonViewer,
      props: { body: JSON.stringify(secret, null, 2) },
    };
  },
};

/**
 * <TConfig>(config:TConfig) => Account
 * The account block is used to configure platforms using settings
 */
export default secretBlock;
