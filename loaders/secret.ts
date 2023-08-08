import { getOrGenerateKey, td, te } from "$live/commons/secrets/keys.ts";
import { decode as hd } from "std/encoding/hex.ts";

/**
 * @title Secret
 */
export interface Secret {
  get: () => Promise<string | null>;
}

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
): Secret {
  let decrypted: Promise<string> | null = null;
  return {
    get: async (): Promise<string | null> => {
      return await (decrypted ??= props.encrypted
        ? decrypt(props).then((
          { decrypted: value },
        ) => value)
        : null);
    },
  };
}
