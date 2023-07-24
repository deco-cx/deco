import { Vault } from "$live/blocks/secret.ts";
import { PromiseOrValue } from "$live/engine/core/utils.ts";

export interface Props {
  /**
   * @title Secret Value
   * @format secret
   */
  secretKey: string;
}

/**
 * @title Secret
 */
export default function Secret(props: Props): Vault {
  return {
    get: (): PromiseOrValue<string | undefined> => {
      return Deno.env.get(`DECO_SECRET_${props.secretKey}`);
    },
  };
}
