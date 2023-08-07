import { Vault } from "$live/blocks/secret.ts";
import { PromiseOrValue } from "$live/engine/core/utils.ts";
import type { Manifest } from "$live/live.gen.ts";
import { FnContext } from "$live/mod.ts";
export interface Props {
  /**
   * @title Secret Value
   * @format secret
   */
  encrypted: string;
}

/**
 * @title Secret
 */
export default function Secret(
  props: Props,
  // deno-lint-ignore ban-types
  ctx: FnContext<{}, Manifest>,
): Vault {
  let decrypted: Promise<string> | null = null;
  return {
    get: (): PromiseOrValue<string | null> => {
      return decrypted ??= props.encrypted
        ? ctx.invoke("$live/actions/secrets/decrypt.ts", props).then((
          { decrypted: value },
        ) => value)
        : null;
    },
  };
}
