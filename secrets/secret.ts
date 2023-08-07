import { getOrGenerateKey, td, te } from "$live/actions/secrets/__key__.ts";
import { Vault } from "$live/blocks/secret.ts";
import { PromiseOrValue } from "$live/engine/core/utils.ts";
import { decode as hd } from "https://deno.land/std@0.190.0/encoding/hex.ts";

export interface Props {
  /**
   * @title Secret Value
   * @format secret
   */
  encrypted: string;
}

const decrypt = async ({ encrypted }: Props) => {
  const { key, iv } = await getOrGenerateKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv },
    key,
    hd(te(encrypted)),
  );
  const decryptedBytes = new Uint8Array(decrypted);
  return { decrypted: td(decryptedBytes) };
};
/**
 * @title Secret
 */
export default function Secret(
  props: Props,
): Vault {
  let decrypted: Promise<string> | null = null;
  return {
    get: (): PromiseOrValue<string | null> => {
      return decrypted ??= props.encrypted
        ? decrypt(props).then((
          { decrypted: value },
        ) => value)
        : null;
    },
  };
}
